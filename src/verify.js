// Is the picked file the one the project needs? Two signals: hashes the
// repo publishes, and the console header inside the dump (title, game code,
// region, version). BIOS files are checked against emulator-documented sums.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { GBA_BIOS_CHECKSUM, GBA_BIOS_SIZE, PS1_BIOS_MD5 } from "./bios-table.js";
import { cueCompanions } from "./setup.js";

const REGION_CODES = { E: "USA", J: "Japan", P: "Europe", D: "Germany", F: "France", I: "Italy", S: "Spain", U: "Australia", K: "Korea", X: "Europe", Y: "Europe", A: "any" };
const PS1_REGIONS = { U: "USA", E: "Europe", P: "Japan" };
const ascii = (buf, off, len) => buf.toString("latin1", off, off + len).replace(/\0.*$/s, "").trim();

function readHead(file, bytes) {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally { fs.closeSync(fd); }
}

// { system, title, gameCode, region, version, note } or null when the format isn't recognised.
export function identify(file) {
  const ext = path.extname(file).toLowerCase();
  if (/\.(rvz|ciso|gcz|wbfs|chd|7z|zip|rar)$/.test(ext)) return { system: "compressed", note: "Compressed image - hash only", region: "unknown" };
  if ([".z64", ".n64", ".v64"].includes(ext)) return identifyN64(readHead(file, 0x40));
  if (ext === ".gba") return identifyGBA(readHead(file, 0xC0));
  if (ext === ".nds") return identifyNDS(readHead(file, 0x20));
  if (ext === ".nes") return identifyNES(readHead(file, 16), file);
  if ([".iso", ".gcm"].includes(ext)) return identifyGCWii(readHead(file, 0x40)) || identifyPS1(file);
  if ([".bin", ".cue"].includes(ext)) return identifyPS1(file);
  return null;
}

function identifyN64(h) {
  if (h.length < 0x40) return null;
  const magic = h.readUInt32BE(0);
  let b = Buffer.from(h);
  if (magic === 0x37804012) b.swap16();                    // .v64 byte-swapped
  else if (magic === 0x40123780) b.swap32();               // .n64 little-endian
  else if (magic !== 0x80371240) return null;
  const gameCode = ascii(b, 0x3B, 4);
  return { system: "Nintendo 64", title: ascii(b, 0x20, 20), gameCode, region: REGION_CODES[gameCode[3]] || "unknown", version: `v1.${b[0x3F]}` };
}

function identifyGBA(h) {
  if (h.length < 0xC0 || h[0xB2] !== 0x96) return null;
  const gameCode = ascii(h, 0xAC, 4);
  return { system: "Game Boy Advance", title: ascii(h, 0xA0, 12), gameCode, region: REGION_CODES[gameCode[3]] || "unknown", version: `v1.${h[0xBC]}` };
}

function identifyNDS(h) {
  if (h.length < 0x20) return null;
  const gameCode = ascii(h, 0x0C, 4);
  if (!/^[A-Z0-9]{4}$/.test(gameCode)) return null;
  return { system: "Nintendo DS", title: ascii(h, 0x00, 12), gameCode, region: REGION_CODES[gameCode[3]] || "unknown", version: `v1.${h[0x1E]}` };
}

function identifyNES(h, file) {
  if (h.length < 16 || h.toString("latin1", 0, 4) !== "NES\x1a") return null;
  return { system: "NES", title: path.basename(file, path.extname(file)), gameCode: null, region: "unknown", version: null, note: "iNES header carries no region" };
}

function identifyGCWii(h) {
  if (h.length < 0x40) return null;
  const gc = h.readUInt32BE(0x1C) === 0xC2339F3D, wii = h.readUInt32BE(0x18) === 0x5D1C9EA3;
  if (!gc && !wii) return null;
  const gameCode = ascii(h, 0, 6);
  return { system: wii ? "Nintendo Wii" : "Nintendo GameCube", title: ascii(h, 0x20, 64), gameCode, region: REGION_CODES[gameCode[3]] || "unknown", version: `v1.${h[7]}` };
}

function identifyPS1(file) {
  const target = path.extname(file).toLowerCase() === ".cue" ? cueCompanions(file)[0] : file;
  if (!target || !fs.existsSync(target)) return null;
  const head = readHead(target, 1_048_576).toString("latin1");
  const m = head.match(/\b(S[CL][UEP][SMD])[_-](\d{3})\.(\d{2})\b/);
  if (!m) return null;
  const serial = `${m[1]}-${m[2]}${m[3]}`;
  return { system: "PlayStation", title: null, gameCode: serial, region: PS1_REGIONS[m[1][2]] || "unknown", version: null };
}

// One streaming pass, every algo at once. Returns { sha1, md5, ... } lowercase hex.
export async function hashFile(file, algos, onProgress = () => {}) {
  const total = fs.statSync(file).size;
  const hashes = Object.fromEntries(algos.filter((a) => a !== "crc32").map((a) => [a, crypto.createHash(a)]));
  let crc = 0, done = 0, lastPct = -1;
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 4 * 1_048_576 })) {
    for (const h of Object.values(hashes)) h.update(chunk);
    if (algos.includes("crc32")) crc = zlib.crc32(chunk, crc);
    done += chunk.length;
    const pct = Math.floor((done / total) * 100);
    if (pct >= lastPct + 5) { lastPct = pct; onProgress(pct); }
  }
  const out = Object.fromEntries(Object.entries(hashes).map(([a, h]) => [a, h.digest("hex")]));
  if (algos.includes("crc32")) out.crc32 = crc.toString(16).padStart(8, "0");
  return out;
}

// mGBA's GBAChecksum: sum of little-endian 32-bit words, wrapping at 32 bits.
export function gbaChecksum(buf) {
  let sum = 0;
  for (let i = 0; i + 4 <= buf.length; i += 4) sum = (sum + buf.readUInt32LE(i)) >>> 0;
  return sum;
}

export async function checkBios(file, spec, log) {
  const size = fs.statSync(file).size;
  const checks = [];
  if (spec.expected_size) checks.push({ what: "size", expected: `${spec.expected_size} bytes`, actual: `${size} bytes`, ok: size === spec.expected_size });
  const text = `${spec.label} ${spec.description} ${spec.expected_filename || ""}`.toLowerCase();
  let detected = null;
  if (/gba|game ?boy ?advance/.test(text) || size === GBA_BIOS_SIZE) {
    const sum = gbaChecksum(fs.readFileSync(file));
    const ok = size === GBA_BIOS_SIZE && sum === GBA_BIOS_CHECKSUM;
    checks.push({ what: "GBA BIOS checksum (mGBA)", expected: GBA_BIOS_CHECKSUM.toString(16), actual: sum.toString(16), ok });
    if (ok) detected = "Game Boy Advance BIOS";
  }
  if (/playstation|ps1|psx|scph/.test(text) || size === 524288) {
    const { md5 } = await hashFile(file, ["md5"], (p) => log(`  hashing ${p}%`));
    const hit = PS1_BIOS_MD5[md5];
    checks.push({ what: "PS1 BIOS MD5 (DuckStation list)", expected: "a known SCPH dump", actual: hit ? `${hit.name} [${hit.region}]` : md5, ok: !!hit });
    if (hit) detected = `PlayStation BIOS ${hit.name} (${hit.region})`;
  }
  return finish(checks, detected ? { system: "BIOS", title: detected, region: "unknown" } : null, spec);
}

function finish(checks, detected, spec) {
  const status = checks.length === 0 ? "unverified" : checks.every((c) => c.ok) ? "match" : "mismatch";
  const summary = status === "match" ? `Verified: ${checks.map((c) => c.what).join(", ")}`
    : status === "mismatch" ? `Mismatch: ${checks.filter((c) => !c.ok).map((c) => `${c.what} is ${c.actual}, needs ${c.expected}`).join("; ")}`
    : `Couldn't verify - ${detected ? `detected ${describe(detected)}` : "unknown format and no hash published"}`;
  return { status, summary, detected, checks };
}

export const describe = (d) => d ? [d.system, d.title && `"${d.title}"`, d.gameCode, d.region !== "unknown" && `(${d.region})`, d.version].filter(Boolean).join(" ") : "";

// The whole check for one picked file against one plan game_file.
export async function verifyPick(file, spec, { log = () => {} } = {}) {
  if (!fs.existsSync(file)) return { status: "mismatch", summary: "File not found", detected: null, checks: [] };
  if (spec.kind === "bios") return checkBios(file, spec, log);

  const checks = [];
  const detected = fs.statSync(file).isDirectory() ? null : identify(file);
  const wantRegion = spec.expected_region && !["any", "unknown"].includes(spec.expected_region) ? spec.expected_region : null;
  if (detected?.region && detected.region !== "unknown" && wantRegion) {
    checks.push({ what: "region", expected: wantRegion, actual: detected.region, ok: detected.region === wantRegion });
  }
  const norm = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (spec.expected_serial && detected?.gameCode && detected.system === "PlayStation") {
    checks.push({ what: "disc serial", expected: spec.expected_serial, actual: detected.gameCode, ok: norm(detected.gameCode) === norm(spec.expected_serial) });
  }
  const wantVer = spec.required_version?.match(/\b(?:v|rev(?:ision)?\s*)?1\.(\d)\b|\brev\s*([a-c0-9])\b/i);
  if (detected?.version && wantVer) {
    const want = wantVer[1] ?? (wantVer[2] && /\d/.test(wantVer[2]) ? wantVer[2] : { a: "1", b: "2", c: "3" }[wantVer[2]?.toLowerCase()]);
    if (want !== undefined) checks.push({ what: "version", expected: `v1.${want}`, actual: detected.version, ok: detected.version === `v1.${want}` });
  }
  if (spec.expected_size && !fs.statSync(file).isDirectory()) {
    const size = fs.statSync(file).size;
    checks.push({ what: "size", expected: `${spec.expected_size} bytes`, actual: `${size} bytes`, ok: size === spec.expected_size });
  }
  const hashes = (spec.expected_hashes || []).filter((h) => ["sha1", "md5", "sha256", "crc32"].includes(h.algo));
  if (hashes.length && !fs.statSync(file).isDirectory()) {
    const files = [file, ...cueCompanions(file)];
    const algos = [...new Set(hashes.map((h) => h.algo))];
    let matched = null;
    const seen = [];
    for (const f of files) {
      log(`  hashing ${path.basename(f)}…`);
      const got = await hashFile(f, algos, (p) => log(`  ${path.basename(f)} ${p}%`));
      seen.push(got);
      matched = hashes.find((h) => got[h.algo] === h.value.toLowerCase().trim()) || matched;
      if (matched) break;
    }
    checks.push({ what: "published hash", expected: hashes.map((h) => `${h.algo} ${h.value}`).join(" or "), actual: seen.map((g) => algos.map((a) => `${a} ${g[a]}`).join(", ")).join(" | "), ok: !!matched });
  }
  return finish(checks, detected, spec);
}
