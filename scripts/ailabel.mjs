#!/usr/bin/env node
// AI-use labels from what each project's README says (admin only). Two steps, like the queue sorter:
//   node scripts/ailabel.mjs prep [--site DIR]    every published game's README sentences that mention AI ->
//                                                  ~/.decomp-buddy-ailabel/batch.md (+ readmes/ for checking quotes)
//   (a Claude Code agent follows ~/.decomp-buddy-ailabel/RULES.md and writes answers.json)
//   node scripts/ailabel.mjs import [--site DIR]  checks every quote is really in that README, then writes
//                                                  facts.ai_use + facts.ai_quote into plans.json
// READMEs come from raw file hosts (no GitHub API quota).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aiMentions } from "../src/ailabel.js";
import { hostOf } from "../src/hosts.js";
import crypto from "node:crypto";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const site = arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site");
const PLANS = path.join(site, "public", "decomp-buddy", "plans.json");
const DIR = path.join(os.homedir(), ".decomp-buddy-ailabel"), RD = path.join(DIR, "readmes");
const norm = (t) => String(t).replace(/[*_`>#[\]]/g, "").replace(/\(https?:[^)]*\)/g, "").replace(/\s+/g, " ").trim();
const idOf = (k) => k.replace(/[^a-z0-9]+/gi, "_");
const plans = JSON.parse(fs.readFileSync(PLANS, "utf8"));

async function readme(host, owner, repo) {
  for (const name of ["README.md", "readme.md", "README.MD", "Readme.md", "README"]) {
    try { const r = await fetch(hostOf(host).raw(owner, repo, name), { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(20_000) }); if (r.ok) return await r.text(); } catch {}
  }
  return null;
}

// decided.json: { key: sha1 of the README } for every README already decided, so a daily run only asks about new
// games and READMEs that changed. --all asks about everything again.
const DECIDED = path.join(DIR, "decided.json"), sha = (t) => crypto.createHash("sha1").update(t).digest("hex");
const decided = (() => { try { return JSON.parse(fs.readFileSync(DECIDED, "utf8")); } catch { return {}; } })();
if (process.argv[2] === "prep") {
  fs.mkdirSync(RD, { recursive: true });
  for (const f of fs.readdirSync(RD)) fs.rmSync(path.join(RD, f));
  const keys = Object.keys(plans.plans), hits = []; let i = 0, unread = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < keys.length) {
      const key = keys[i++], [host, full] = key.split(":"), [owner, repo] = full.split("/");
      const text = await readme(host, owner, repo); if (text === null) { unread++; continue; }
      if (!process.argv.includes("--all") && decided[key] === sha(text)) continue;
      const said = aiMentions(text); if (!said.length) { decided[key] = sha(text); continue; } // nothing to ask about
      fs.writeFileSync(path.join(RD, `${idOf(key)}.txt`), norm(text)); fs.writeFileSync(path.join(RD, `${idOf(key)}.sha`), sha(text)); hits.push({ key, said });
    }
  }));
  hits.sort((a, b) => a.key.localeCompare(b.key));
  fs.writeFileSync(path.join(DIR, "batch.md"), hits.map((h, n) => `=== ${n + 1}. ${h.key} ===\n${h.said.map((s) => `- ${s}`).join("\n")}\n`).join("\n"));
  fs.writeFileSync(path.join(DIR, "keys.json"), JSON.stringify(hits.map((h) => h.key)));
  fs.writeFileSync(DECIDED, JSON.stringify(decided)); fs.rmSync(path.join(DIR, "answers.json"), { force: true });
  fs.writeFileSync(path.join(DIR, "batch-1.md"), fs.readFileSync(path.join(DIR, "batch.md"), "utf8"));
  console.log(`ailabel prep: ${hits.length} README(s) to decide (of ${keys.length}; ${unread} unreadable) -> ${path.join(DIR, "batch.md")}`);
} else if (process.argv[2] === "import") {
  const answers = JSON.parse(fs.readFileSync(path.join(DIR, "answers.json"), "utf8")), keys = new Set(JSON.parse(fs.readFileSync(path.join(DIR, "keys.json"), "utf8")));
  const tally = { none: 0, assisted: 0, generated: 0, unsaid: 0 }, bad = [];
  for (const [key, a] of Object.entries(answers)) {
    const e = plans.plans[key]; if (!e || !keys.has(key)) { bad.push(`${key}: not in the batch`); continue; }
    e.facts ||= {}; delete e.facts.ai_use; delete e.facts.ai_quote;
    if (!a || !a.ai_use) { tally.unsaid++; continue; }
    const text = fs.readFileSync(path.join(RD, `${idOf(key)}.txt`), "utf8"), q = norm(a.quote || "").replace(/\(https?:\S*$/, "").trim(); // a sentence cut inside a link: drop the half link
    if (!["none", "assisted", "generated"].includes(a.ai_use) || q.length < 8 || !text.includes(q)) { bad.push(`${key}: quote not found word for word`); continue; }
    e.facts.ai_use = a.ai_use; e.facts.ai_quote = q.slice(0, 300); tally[a.ai_use]++;
  }
  for (const key of Object.keys(answers)) { try { decided[key] = fs.readFileSync(path.join(RD, `${idOf(key)}.sha`), "utf8"); } catch {} }
  fs.writeFileSync(DECIDED, JSON.stringify(decided));
  plans.updatedAt = new Date().toISOString(); const t = `${PLANS}.tmp`; fs.writeFileSync(t, JSON.stringify(plans)); fs.renameSync(t, PLANS);
  console.log(`ailabel import: ${tally.none} no AI, ${tally.assisted} AI-assisted, ${tally.generated} made with AI, ${tally.unsaid} left unlabeled${bad.length ? `; ${bad.length} rejected:\n  ${bad.join("\n  ")}` : ""}`);
} else { console.log("usage: node scripts/ailabel.mjs prep|import [--site DIR]"); process.exit(2); }
