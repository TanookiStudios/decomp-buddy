// No-Intro / Redump DAT files (Logiqx XML): load once, then any dump can be checked byte-for-byte
// against the preservation databases - not only when a project happens to publish a hash.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { hashFile } from "./verify.js";

const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i")); return m ? m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : null; };

export function parseDat(xml) {
  const header = (xml.match(/<header>([\s\S]*?)<\/header>/i) || [])[1] || "";
  const name = ((header.match(/<name>([\s\S]*?)<\/name>/i) || [])[1] || "").trim() || "Unnamed DAT";
  const bySha1 = {}, byMd5 = {}, byCrc = {};
  let games = 0;
  for (const m of xml.matchAll(/<(game|machine)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const game = attr(m[2], "name"); if (!game) continue;
    games++;
    for (const r of m[3].matchAll(/<rom\b[^>]*\/?>/gi)) {
      const rom = attr(r[0], "name"), size = Number(attr(r[0], "size") || 0);
      const hit = [game, rom];
      const sha1 = attr(r[0], "sha1"), md5 = attr(r[0], "md5"), crc = attr(r[0], "crc");
      if (sha1) bySha1[sha1.toLowerCase()] = hit;
      if (md5) byMd5[md5.toLowerCase()] = hit;
      if (crc) byCrc[`${crc.toLowerCase()}:${size}`] = hit;
    }
  }
  if (!games) throw new Error("No games in that file - is it a No-Intro or Redump DAT (Logiqx XML)?");
  return { name, games, bySha1, byMd5, byCrc };
}

export function addDat(dir, file) {
  const parsed = parseDat(fs.readFileSync(file, "utf8"));
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.createHash("sha1").update(parsed.name).digest("hex").slice(0, 12);
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, file: path.basename(file), addedAt: new Date().toISOString(), ...parsed }));
  return { id, name: parsed.name, games: parsed.games };
}
export function listDats(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => { try { const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); return { id: d.id, name: d.name, games: d.games, file: d.file, addedAt: d.addedAt }; } catch { return null; } }).filter(Boolean);
}
export function removeDat(dir, id) { fs.rmSync(path.join(dir, `${String(id).replace(/[^a-f0-9]/g, "")}.json`), { force: true }); }
const loadAll = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) : []);

export function lookup(dats, h, size) {
  for (const d of dats) {
    const hit = (h.sha1 && d.bySha1[h.sha1]) || (h.md5 && d.byMd5[h.md5]) || (h.crc32 && d.byCrc[`${h.crc32}:${size}`]);
    if (hit) return { dat: d.name, game: hit[0], rom: hit[1] };
  }
  return null;
}

// A cue sheet is checked through its tracks: every .bin it names must match the same DAT game.
export async function checkAgainstDats(dir, file, { hash = hashFile } = {}) {
  const dats = loadAll(dir); if (!dats.length) return null;
  const tracks = /\.cue$/i.test(file)
    ? [...fs.readFileSync(file, "utf8").matchAll(/FILE\s+"([^"]+)"/gi)].map((m) => path.join(path.dirname(file), m[1])).filter((p) => fs.existsSync(p))
    : [file];
  if (!tracks.length) return { matched: false, note: "the cue sheet names no track files next to it" };
  const hits = [];
  for (const t of tracks) { const h = await hash(t, ["sha1", "md5", "crc32"]); hits.push(lookup(dats, h, fs.statSync(t).size)); }
  if (hits.every(Boolean) && new Set(hits.map((x) => x.game)).size === 1) return { matched: true, ...hits[0], tracks: tracks.length };
  const some = hits.filter(Boolean);
  return some.length ? { matched: false, note: `${some.length} of ${tracks.length} tracks match ${some[0].game}` } : { matched: false, note: "not in your DAT files" };
}
