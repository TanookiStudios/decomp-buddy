#!/usr/bin/env node
// Feature badges (60 FPS, Widescreen, HD, Ray Tracing, Mods, Online Play, Local Multiplayer) from what each project's README
// says (src/features.js). Same two steps as ailabel.mjs:
//   node scripts/features.mjs prep [--site DIR] [--all]   candidate sentences -> ~/.decomp-buddy-features/batch-N.md
//   (Claude Code agents follow ~/.decomp-buddy-features/RULES.md and write answers-N.json)
//   node scripts/features.mjs import [--site DIR]          every quote must be in that README word for word, then
//                                                           facts.features { key: quote } goes into plans.json
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { featureMentions, FEATURES, underNotYetHeading } from "../src/features.js";
import { hostOf } from "../src/hosts.js";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const site = arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site");
const PLANS = path.join(site, "public", "decomp-buddy", "plans.json");
const DIR = path.join(os.homedir(), ".decomp-buddy-features"), RD = path.join(DIR, "readmes"), PER = 120;
const norm = (t) => String(t).replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\(https?:[^)]*\)|https?:\/\/\S+/g, " ").replace(/[*_`>#[\]]/g, "").replace(/\s+/g, " ").trim();
const idOf = (k) => k.replace(/[^a-z0-9]+/gi, "_"), sha = (t) => crypto.createHash("sha1").update(t).digest("hex");
const plans = JSON.parse(fs.readFileSync(PLANS, "utf8"));
const DECIDED = path.join(DIR, "decided.json"), decided = (() => { try { return JSON.parse(fs.readFileSync(DECIDED, "utf8")); } catch { return {}; } })();

async function readme(host, owner, repo) {
  for (const name of ["README.md", "readme.md", "README.MD", "Readme.md", "README"]) {
    try { const r = await fetch(hostOf(host).raw(owner, repo, name), { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(20_000) }); if (r.ok) return await r.text(); } catch {}
  }
  return null;
}

if (process.argv[2] === "prep") {
  fs.mkdirSync(RD, { recursive: true });
  for (const f of fs.readdirSync(DIR)) if (/^(batch|answers)-\d+\.(md|json)$/.test(f)) fs.rmSync(path.join(DIR, f));
  for (const f of fs.readdirSync(RD)) fs.rmSync(path.join(RD, f));
  const keys = Object.keys(plans.plans), hits = []; let i = 0, unread = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < keys.length) {
      const key = keys[i++], [host, full] = key.split(":"), [owner, repo] = full.split("/");
      const text = await readme(host, owner, repo); if (text === null) { unread++; continue; }
      if (!process.argv.includes("--all") && decided[key] === sha(text)) continue;
      const said = featureMentions(text); if (!Object.keys(said).length) { decided[key] = sha(text); continue; }
      fs.writeFileSync(path.join(RD, `${idOf(key)}.txt`), norm(text)); fs.writeFileSync(path.join(RD, `${idOf(key)}.md`), text); fs.writeFileSync(path.join(RD, `${idOf(key)}.sha`), sha(text)); hits.push({ key, said });
    }
  }));
  hits.sort((a, b) => a.key.localeCompare(b.key));
  for (let b = 0; b * PER < hits.length; b++) fs.writeFileSync(path.join(DIR, `batch-${b + 1}.md`), hits.slice(b * PER, (b + 1) * PER).map((h, n) =>
    `=== ${b * PER + n + 1}. ${h.key} ===\n${Object.entries(h.said).flatMap(([f, list]) => list.map((s) => `[${f}] ${s}`)).join("\n")}\n`).join("\n"));
  fs.writeFileSync(path.join(DIR, "keys.json"), JSON.stringify(hits.map((h) => h.key)));
  fs.writeFileSync(DECIDED, JSON.stringify(decided));
  console.log(`features prep: ${hits.length} README(s) to decide in ${Math.ceil(hits.length / PER)} batch(es) (of ${keys.length}; ${unread} unreadable) -> ${DIR}`);
} else if (process.argv[2] === "import") {
  const keys = new Set(JSON.parse(fs.readFileSync(path.join(DIR, "keys.json"), "utf8")));
  const answers = Object.assign({}, ...fs.readdirSync(DIR).filter((f) => /^answers-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"))));
  const tally = Object.fromEntries(Object.keys(FEATURES).map((k) => [k, 0])), bad = []; let games = 0;
  for (const [key, a] of Object.entries(answers)) {
    const e = plans.plans[key]; if (!e || !keys.has(key)) { bad.push(`${key}: not in the batch`); continue; }
    const text = fs.readFileSync(path.join(RD, `${idOf(key)}.txt`), "utf8"), got = {};
    for (const [f, quote] of Object.entries(a || {})) {
      if (!FEATURES[f] || !quote) continue;
      const q = norm(quote); if (q.length < 8 || !text.includes(q)) { bad.push(`${key} ${f}: quote not found word for word`); continue; }
      let raw = ""; try { raw = fs.readFileSync(path.join(RD, `${idOf(key)}.md`), "utf8"); } catch {}
      if (underNotYetHeading(raw, quote)) { bad.push(`${key} ${f}: under a planned/roadmap heading`); continue; }
      got[f] = q.slice(0, 300); tally[f]++;
    }
    e.facts ||= {}; if (Object.keys(got).length) { e.facts.features = got; games++; } else delete e.facts.features;
    try { decided[key] = fs.readFileSync(path.join(RD, `${idOf(key)}.sha`), "utf8"); } catch {}
  }
  const missing = [...keys].filter((k) => !(k in answers));
  fs.writeFileSync(DECIDED, JSON.stringify(decided));
  plans.updatedAt = new Date().toISOString(); const t = `${PLANS}.tmp`; fs.writeFileSync(t, JSON.stringify(plans)); fs.renameSync(t, PLANS);
  console.log(`features import: ${games} game(s) with badges - ${Object.entries(tally).map(([k, n]) => `${FEATURES[k].label} ${n}`).join(", ")}${missing.length ? `; ${missing.length} not answered yet` : ""}${bad.length ? `; ${bad.length} rejected:\n  ${bad.slice(0, 30).join("\n  ")}` : ""}`);
} else { console.log("usage: node scripts/features.mjs prep|import [--site DIR] [--all]"); process.exit(2); }
