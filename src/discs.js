// Multi-disc games: pick one folder, get each disc placed in the right row.
// Order of evidence: the disc's own serial (PS1 cue/bin carry it) matching the row's expected serial,
// then "Disc N" in the file name matching "Disc N" in the row's label, then plain name order.

import fs from "node:fs";
import path from "node:path";
import { identify } from "./verify.js";

const DISC_EXT = /\.(cue|chd|iso|gcm|bin|rvz|ciso|gcz|wbfs|ccd|mds|img|pbp)$/i;
const discNo = (s) => { const m = String(s).match(/(?:disc|disk|cd)\s*[-_#]?\s*(\d+)/i); return m ? Number(m[1]) : null; };
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function discCandidates(folder) {
  const files = [];
  const walk = (d, depth) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory() && depth < 1) walk(p, depth + 1); else if (e.isFile() && DISC_EXT.test(e.name)) files.push(p); } };
  walk(folder, 0);
  // A .bin that has a .cue beside it is part of that cue, not a disc of its own.
  const cues = new Set(files.filter((f) => /\.cue$/i.test(f)).map((f) => f.replace(/\.cue$/i, "").toLowerCase()));
  return files.filter((f) => !(/\.bin$/i.test(f) && [...cues].some((c) => f.toLowerCase().startsWith(c)))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function sortDiscs(folder, gameFiles) {
  const cands = discCandidates(folder).map((p) => { let serial = null; try { serial = identify(p)?.gameCode || null; } catch {} return { path: p, serial, disc: discNo(path.basename(p)) }; });
  const rows = gameFiles.map((f, i) => ({ i, f })).filter(({ f }) => f.kind !== "bios");
  const out = {}, used = new Set(), how = {};
  const take = (i, c, why) => { out[i] = c.path; used.add(c.path); how[i] = why; };
  for (const { i, f } of rows) { const c = f.expected_serial && cands.find((c) => !used.has(c.path) && c.serial && norm(c.serial) === norm(f.expected_serial)); if (c) take(i, c, "serial"); }
  for (const { i, f } of rows) { if (out[i]) continue; const n = discNo(f.label); const c = n && cands.find((c) => !used.has(c.path) && c.disc === n); if (c) take(i, c, "disc number"); }
  for (const { i } of rows) { if (out[i]) continue; const c = cands.find((c) => !used.has(c.path)); if (c) take(i, c, "name order"); }
  return { assignments: out, how, unmatched: cands.filter((c) => !used.has(c.path)).map((c) => c.path), found: cands.length };
}
