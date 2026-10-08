// Turn the dump you have into the format the project wants. Pure JS where the format is
// simple (N64 byte order, CISO, GCZ); RVZ/WIA and CHD need DolphinTool / chdman, used when
// they're installed and named exactly when they're not - nothing is downloaded blind.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const ext = (f) => path.extname(f).toLowerCase();

const CONVERSIONS = [
  { from: [".v64", ".n64"], to: ".z64", kind: "n64" },
  { from: [".ciso"], to: ".iso", kind: "ciso" },
  { from: [".gcz"], to: ".iso", kind: "gcz" },
  { from: [".rvz", ".wia"], to: ".iso", kind: "dolphin" },
  { from: [".chd"], to: ".cue", kind: "chd" },
];

// What conversion would make `file` acceptable? null when it already is or none applies.
export function conversionFor(file, acceptedFormats = []) {
  const acc = acceptedFormats.map((f) => f.toLowerCase().replace(/^\*?\.?/, "."));
  const e = ext(file);
  if (!acc.length || acc.includes(e)) return null;
  return CONVERSIONS.find((c) => c.from.includes(e) && (acc.includes(c.to) || (c.to === ".cue" && acc.includes(".bin")))) || null;
}

// ---- N64: .v64 (byte-swapped) / .n64 (little-endian) -> .z64 (big-endian)
export function convertN64(src, dest) {
  const fd = fs.openSync(src, "r"); const out = fs.openSync(dest, "w");
  try {
    const head = Buffer.alloc(4); fs.readSync(fd, head, 0, 4, 0);
    const magic = head.readUInt32BE(0);
    const mode = magic === 0x37804012 ? "swap16" : magic === 0x40123780 ? "swap32" : magic === 0x80371240 ? null : "unknown";
    if (mode === "unknown") throw new Error("Not an N64 ROM (no known byte-order signature).");
    const buf = Buffer.alloc(4 * 1024 * 1024);
    let pos = 0, n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, pos)) > 0) { const chunk = buf.subarray(0, n - (n % 4)); if (mode === "swap16") chunk.swap16(); else if (mode === "swap32") chunk.swap32(); fs.writeSync(out, chunk); pos += n; }
  } finally { fs.closeSync(fd); fs.closeSync(out); }
  return dest;
}

// ---- CISO (Wii/GC "compact ISO": header 'CISO' + u32 block size + 32768-byte block map)
export function convertCiso(src, dest) {
  const fd = fs.openSync(src, "r"); const out = fs.openSync(dest, "w");
  try {
    const head = Buffer.alloc(0x8000); fs.readSync(fd, head, 0, 0x8000, 0);
    if (head.toString("latin1", 0, 4) !== "CISO") throw new Error("Not a CISO image.");
    const block = head.readUInt32LE(4);
    const zero = Buffer.alloc(block);
    const data = Buffer.alloc(block);
    let srcPos = 0x8000;
    for (let i = 8; i < 0x8000; i++) {
      if (head[i] === 1) { fs.readSync(fd, data, 0, block, srcPos); fs.writeSync(out, data); srcPos += block; }
      else if (head[i] === 0) { if (head.subarray(i).some((b) => b === 1)) fs.writeSync(out, zero); else break; } // trailing unmapped blocks aren't written
      else throw new Error("Corrupt CISO block map.");
    }
  } finally { fs.closeSync(fd); fs.closeSync(out); }
  return dest;
}

// ---- GCZ (Dolphin's old zlib format): 32-byte header, u64 block pointers (top bit = stored raw), u32 hashes, blocks
export function convertGcz(src, dest) {
  const fd = fs.openSync(src, "r"); const out = fs.openSync(dest, "w");
  try {
    const head = Buffer.alloc(32); fs.readSync(fd, head, 0, 32, 0);
    if (head.readUInt32LE(0) !== 0xb10bc001) throw new Error("Not a GCZ image.");
    const compressedSize = Number(head.readBigUInt64LE(8)), dataSize = Number(head.readBigUInt64LE(16)), blockSize = head.readUInt32LE(24), numBlocks = head.readUInt32LE(28);
    const ptrs = Buffer.alloc(numBlocks * 8); fs.readSync(fd, ptrs, 0, ptrs.length, 32);
    const dataStart = 32 + numBlocks * 8 + numBlocks * 4;
    let written = 0;
    for (let i = 0; i < numBlocks; i++) {
      const raw = ptrs.readBigUInt64LE(i * 8);
      const uncompressed = (raw & (1n << 63n)) !== 0n;
      const off = Number(raw & ((1n << 63n) - 1n));
      const next = i + 1 < numBlocks ? Number(ptrs.readBigUInt64LE((i + 1) * 8) & ((1n << 63n) - 1n)) : compressedSize;
      const len = next - off;
      const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, dataStart + off);
      const block = uncompressed ? buf : zlib.inflateSync(buf);
      const take = Math.min(block.length, dataSize - written);
      fs.writeSync(out, block.subarray(0, take)); written += take;
    }
  } finally { fs.closeSync(fd); fs.closeSync(out); }
  return dest;
}

// ---- Tools we don't ship
export function findTool(name) {
  const candidates = process.platform === "win32"
    ? { DolphinTool: ["DolphinTool.exe", "C:\\Program Files\\Dolphin\\DolphinTool.exe", "C:\\Program Files\\Dolphin-x64\\DolphinTool.exe"], chdman: ["chdman.exe", "C:\\mame\\chdman.exe"] }
    : { DolphinTool: ["dolphin-tool", "DolphinTool", "/Applications/Dolphin.app/Contents/MacOS/DolphinTool", "/opt/homebrew/bin/dolphin-tool"], chdman: ["chdman", "/opt/homebrew/bin/chdman", "/usr/local/bin/chdman", "/usr/bin/chdman"] }[name];
  for (const c of candidates || []) {
    if (c.includes("/") || c.includes("\\")) { if (fs.existsSync(c)) return c; continue; }
    try { const p = execFileSync(process.platform === "win32" ? "where" : "which", [c], { encoding: "utf8" }).trim().split(/\r?\n/)[0]; if (p) return p; } catch {}
  }
  return null;
}
export const TOOL_HINT = {
  DolphinTool: process.platform === "win32" ? "Install Dolphin (dolphin-emu.org) - DolphinTool.exe is in its folder." : process.platform === "darwin" ? "Install dolphin-tool: brew install dolphin-tool (or build DolphinTool from dolphin-emu.org)." : "Install dolphin-tool from your distro (e.g. apt install dolphin-emu-tool).",
  chdman: process.platform === "win32" ? "Install MAME (mamedev.org) - chdman.exe is in its folder." : process.platform === "darwin" ? "brew install mame (includes chdman)." : "apt install mame-tools (provides chdman).",
};

// Convert `src` into `destDir`; returns the produced file. Throws with the install hint when a tool is missing.
export async function convertFile(src, destDir, conv, { log = () => {} } = {}) {
  fs.mkdirSync(destDir, { recursive: true });
  const base = path.basename(src, path.extname(src));
  const dest = path.join(destDir, base + conv.to);
  log(`Converting ${path.basename(src)} → ${path.basename(dest)}…`);
  if (conv.kind === "n64") return convertN64(src, dest);
  if (conv.kind === "ciso") return convertCiso(src, dest);
  if (conv.kind === "gcz") return convertGcz(src, dest);
  if (conv.kind === "dolphin") {
    const tool = findTool("DolphinTool"); if (!tool) throw new Error(`Converting ${ext(src)} needs DolphinTool, which isn't installed. ${TOOL_HINT.DolphinTool}`);
    await run(tool, ["convert", "-i", src, "-o", dest, "-f", "iso"], { maxBuffer: 16 * 1024 * 1024 });
    return dest;
  }
  if (conv.kind === "chd") {
    const tool = findTool("chdman"); if (!tool) throw new Error(`Converting .chd needs chdman, which isn't installed. ${TOOL_HINT.chdman}`);
    await run(tool, ["extractcd", "-i", src, "-o", dest, "-ob", path.join(destDir, base + ".bin")], { maxBuffer: 16 * 1024 * 1024 });
    return dest;
  }
  throw new Error(`No converter for ${ext(src)}.`);
}
