#!/usr/bin/env node
// Covers by judgment for the games the SteamGridDB matcher can't settle (admin only).
//   node scripts/boxart-picks.mjs prep [--site <TanookiStudios-Site>]   -> ~/.decomp-buddy-boxart/batches/b-NN.md
//   (agents follow ~/.decomp-buddy-boxart/AGENT.md and write answers/b-NN.json: { "<key>": id | null })
//   node scripts/boxart-picks.mjs import                                 -> ~/.decomp-buddy-boxart/picks.json
//   node scripts/boxart-picks.mjs widen [--site ...]   more SteamGridDB searches (shorter names, no subtitle) for every
//                                                      title still without a cover; they go back to the agents
// SteamGridDB's search ranks loosely ("Dungeon Keeper" only finds "Dungeon Keeper Gold"), so one query isn't enough.
// The next catalog build (scripts/build-catalog.mjs) uses picks.json. Candidates come from the build's own cache,
// so prep makes no network calls; run a catalog build first.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { plainTitle } from "../src/boxart.js";
import { bareTitle } from "../src/steamgriddb.js";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const HOME = path.join(os.homedir(), ".decomp-buddy-boxart"), PICKS = path.join(HOME, "picks.json");
const CACHE = path.join(os.homedir(), ".decomp-buddy", "catalog-build", "steamgriddb.json");
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const PER = 100;

if (process.argv[2] === "prep") {
  const dir = path.join(arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site"), "public", "decomp-buddy");
  const cache = readJSON(CACHE, {}), picks = readJSON(PICKS, {});
  const games = [...readJSON(path.join(dir, "catalog.json"), { games: [] }).games, ...readJSON(path.join(dir, "waiting.json"), { games: [] }).games];
  const byKey = new Map();
  for (const g of games.filter((g) => !g.boxartUrl)) {
    const k = bareTitle(plainTitle(g.title));
    if (!k || k in picks || !cache[k]?.cands?.length) continue;
    (byKey.get(k) || byKey.set(k, []).get(k)).push(g);
  }
  const keys = [...byKey.keys()].sort();
  fs.rmSync(path.join(HOME, "batches"), { recursive: true, force: true }); fs.mkdirSync(path.join(HOME, "batches"), { recursive: true });
  fs.mkdirSync(path.join(HOME, "answers"), { recursive: true });
  for (let n = 0; n * PER < keys.length; n++) {
    const id = `b-${String(n).padStart(2, "0")}`;
    const md = keys.slice(n * PER, (n + 1) * PER).map((k) => {
      const gs = byKey.get(k);
      return [`## ${k}`, ...gs.map((g) => `- ${g.title} · ${g.console || "Unknown"} · ${g.repo || ""}`),
        "Candidates:", ...cache[k].cands.map((c) => `  - ${c.id}: ${c.name}${c.year ? ` (${c.year})` : ""}`)].join("\n");
    }).join("\n\n");
    fs.writeFileSync(path.join(HOME, "batches", `${id}.md`), `# ${id}\n\n${md}\n`);
  }
  console.log(`boxart prep: ${keys.length} title(s) in ${Math.ceil(keys.length / PER)} batch(es) -> ${path.join(HOME, "batches")}`);
} else if (process.argv[2] === "import") {
  const cache = readJSON(CACHE, {}), picks = readJSON(PICKS, {});
  let added = 0, none = 0, bad = 0;
  for (const f of fs.readdirSync(path.join(HOME, "answers")).filter((f) => f.endsWith(".json"))) {
    for (const [k, id] of Object.entries(readJSON(path.join(HOME, "answers", f), {}))) {
      // An answer must be one of the title's own candidates (or null): never an id from anywhere else.
      if (id !== null && !cache[k]?.cands?.some((c) => c.id === id)) { bad++; continue; }
      picks[k] = id; id === null ? none++ : added++;
    }
  }
  fs.writeFileSync(PICKS, JSON.stringify(picks, null, 1));
  console.log(`boxart import: ${added} cover(s) picked, ${none} with no right cover${bad ? `, ${bad} rejected (not a candidate)` : ""} -> ${PICKS}`);
} else if (process.argv[2] === "widen") {
  const { execFileSync } = await import("node:child_process");
  const key = execFileSync("security", ["find-generic-password", "-s", "steamgriddb", "-w"], { encoding: "utf8" }).trim();
  const dir = path.join(arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site"), "public", "decomp-buddy");
  const cache = readJSON(CACHE, {}), picks = readJSON(PICKS, {});
  const games = [...readJSON(path.join(dir, "catalog.json"), { games: [] }).games, ...readJSON(path.join(dir, "waiting.json"), { games: [] }).games].filter((g) => !g.boxartUrl);
  const titles = new Map(); for (const g of games) { const k = bareTitle(plainTitle(g.title)); if (k && !cache[k]?.widened) titles.set(k, plainTitle(g.title)); }
  let n = 0;
  for (const [k, t] of titles) {
    // The name as is, before a subtitle, without edition words or a trailing number, and its first two words.
    const head = t.split(/\s*(?::| - | \/ )\s*/)[0];
    const qs = [...new Set([t, head, head.replace(/\b(remake|remaster(ed)?|hd|definitive|enhanced|edition|collection|trilogy)\b/gi, "").trim(), head.split(/\s+/).slice(0, 2).join(" ")])].filter((q) => q.length > 2);
    const seen = new Map((cache[k]?.cands || []).map((c) => [c.id, c]));
    for (const q of qs) {
      const r = await fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${key}` } });
      if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 30000)); continue; }
      if (!r.ok) continue;
      for (const x of (await r.json()).data || []) if (!seen.has(x.id)) seen.set(x.id, { id: x.id, name: x.name, year: x.release_date ? new Date(x.release_date * 1000).getUTCFullYear() : null });
      await new Promise((ok) => setTimeout(ok, 150));
    }
    cache[k] = { ...(cache[k] || { v: 2, url: null, at: Date.now() }), cands: [...seen.values()].slice(0, 20), widened: true };
    if (picks[k] === null) delete picks[k];   // judged again with the wider list
    if (++n % 100 === 0) { fs.writeFileSync(CACHE, JSON.stringify(cache)); console.log(`widen: ${n}/${titles.size}`); }
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache)); fs.writeFileSync(PICKS, JSON.stringify(picks, null, 1));
  console.log(`boxart widen: ${n} title(s) searched again`);
} else {
  console.log("usage: node scripts/boxart-picks.mjs prep|import");
}
