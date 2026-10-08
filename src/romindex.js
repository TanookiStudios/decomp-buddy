// Game-file library: point the app at folders of your dumps once. Every file is fingerprinted
// (header identity, sha1/md5/crc32) into an index, and after Read Repos each Choose… that the index
// can answer with confidence is filled in for you. Nothing is moved; set-up copies out of the library.

import fs from "node:fs";
import path from "node:path";
import { identify, hashFile } from "./verify.js";

export const ROM_EXT = /\.(z64|n64|v64|gba|gb|gbc|nds|3ds|nes|fds|sfc|smc|md|gen|sms|gg|32x|pce|iso|gcm|bin|cue|chd|rvz|ciso|gcz|wbfs|wia|pbp|cso|img|ccd|mds|xiso|xex|xci|nsp)$/i;

export function readIndex(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { files: {} }; } }
function writeIndex(file, idx) { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(idx)); fs.renameSync(tmp, file); }

export function listRomFiles(folders, { maxDepth = 6 } = {}) {
  const out = [];
  const walk = (d, depth) => {
    let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < maxDepth) walk(p, depth + 1); }
      else if (e.isFile() && ROM_EXT.test(e.name)) out.push(p);
    }
  };
  for (const f of folders) if (f && fs.existsSync(f)) walk(f, 0);
  return out;
}

// Incremental: unchanged files (same size + mtime) keep their entry; gone files drop out.
export async function scanLibrary(folders, indexFile, { onProgress = () => {}, state = {}, hash = hashFile } = {}) {
  const idx = readIndex(indexFile);
  const files = listRomFiles(folders);
  const keep = {}; let fresh = 0, i = 0, bytes = 0;
  for (const p of files) {
    if (state.cancelled) break;
    i++;
    let st; try { st = fs.statSync(p); } catch { continue; }
    const old = idx.files[p];
    if (old && old.size === st.size && old.mtimeMs === st.mtimeMs) { keep[p] = old; continue; }
    let id = null; try { id = identify(p); } catch {}
    const h = await hash(p, ["sha1", "md5", "crc32"]);
    keep[p] = { size: st.size, mtimeMs: st.mtimeMs, system: id?.system || null, serial: id?.gameCode || null, region: id?.region || null, title: id?.title || null, ...h };
    fresh++; bytes += st.size;
    if (fresh % 20 === 0) writeIndex(indexFile, { ...idx, files: { ...idx.files, ...keep } });
    onProgress({ done: i, total: files.length, file: path.basename(p) });
  }
  // A cancelled scan keeps what it had for the files it didn't reach.
  const files2 = state.cancelled ? { ...idx.files, ...keep } : keep;
  const out = { folders, scannedAt: new Date().toISOString(), files: files2 };
  writeIndex(indexFile, out);
  return { total: Object.keys(files2).length, hashed: fresh, bytes, cancelled: !!state.cancelled };
}

const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// Only confident matches auto-fill: a published hash, the disc serial, or the exact expected file name
// with a matching format. A title that merely looks similar never picks a file for you.
export function findInLibrary(idx, gameFile) {
  if (gameFile.kind === "bios") return null;
  const entries = Object.entries(idx.files || {}).filter(([p]) => fs.existsSync(p));
  for (const h of gameFile.expected_hashes || []) {
    const v = String(h.value || "").toLowerCase().trim();
    const hit = entries.find(([, e]) => e[h.algo] === v);
    if (hit) return { path: hit[0], why: `${h.algo} matches the published hash` };
  }
  if (gameFile.expected_serial) {
    const want = norm(gameFile.expected_serial);
    const hits = entries.filter(([p, e]) => e.serial && norm(e.serial) === want && !/\.bin$/i.test(p));
    const cue = hits.find(([p]) => /\.cue$/i.test(p)) || hits[0];
    if (cue) return { path: cue[0], why: `disc serial ${gameFile.expected_serial}` };
  }
  if (gameFile.expected_filename) {
    const hit = entries.find(([p]) => path.basename(p).toLowerCase() === String(gameFile.expected_filename).toLowerCase());
    if (hit) return { path: hit[0], why: `named ${gameFile.expected_filename}` };
  }
  return null;
}
