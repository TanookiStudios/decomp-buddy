#!/usr/bin/env node
// Install plans + facts written by Claude Code agents instead of the paid API.
//
//   node scripts/ccplans.mjs prep   [--site <TanookiStudios-Site>] [--limit N]
//   node scripts/ccplans.mjs import [--site <TanookiStudios-Site>]
//   node scripts/ccplans.mjs status
//
// prep: for every catalog repo missing a plan target or facts, fetch the same repo context the paid
// planner gets and write one job per repo to ~/.decomp-buddy-ccplans/jobs/<id>.md (plus the cached
// context, so import validates against exactly what the agent read). Agents answer with
// out/<id>.json = { "plans": { "<target>": Analysis }, "facts": Facts | null }.
// import: every answer goes through the app's own path - Analysis/Facts schemas, analyzeOne's
// clean-up, extractFacts' grounding - plus one check the paid path doesn't need: a "release" plan
// must name an asset that really is in that release. Anything that fails is reported, never written.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { SYSTEM as PLAN_SYSTEM, Analysis, renderContext } from "../src/plan.js";
import { SYSTEM as FACTS_SYSTEM, Facts, extractFacts } from "../src/facts.js";
import { analyzeOne } from "../src/run.js";
import { writePlans, planKey, TARGET_OF_PLATFORM } from "../src/plans.js";
import { targetOf } from "../src/targets.js";
import { fetchRepoContext as fetchGitHub } from "../src/github.js";
import { fetchRepoContext as fetchGitLab } from "../src/gitlab.js";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SITE = arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site");
const DIR = path.join(SITE, "public", "decomp-buddy");
const WORK = path.join(os.homedir(), ".decomp-buddy-ccplans");
const J = (...p) => path.join(WORK, ...p);
for (const d of ["jobs", "ctx", "out", "done", "rejected"]) fs.mkdirSync(J(d), { recursive: true });
const idOf = (key) => key.replace(/[^a-z0-9]+/g, "_");
const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

// Same rules as the app's workFor(): every platform the catalog says the game has (Windows if none), plus facts.
function work() {
  const cat = readJSON(path.join(DIR, "catalog.json")), pub = readJSON(path.join(DIR, "plans.json"));
  const seen = new Set(), out = [];
  for (const g of cat.games) {
    if (!g.repo) continue;
    const [owner, repo] = g.repo.split("/"); const host = g.host || "github";
    const key = planKey(host, owner, repo); if (seen.has(key)) continue; seen.add(key);
    const entry = pub.plans?.[key] || {};
    const targets = [...new Set((g.platforms || []).flatMap((p) => TARGET_OF_PLATFORM[p] || []))]; if (!targets.length) targets.push("windows");
    const missing = targets.filter((t) => !entry.targets?.[t]);
    const facts = !entry.facts;
    if (missing.length || facts) out.push({ key, id: idOf(key), host, owner, repo, title: g.title, version: g.version || null, targets: missing, facts, hasAnyPlan: !!entry.targets });
  }
  // Games nobody can install yet first, then extra platforms, then facts-only.
  return out.sort((a, b) => (a.hasAnyPlan - b.hasAnyPlan) || (b.targets.length - a.targets.length));
}

const RULES = `# How to answer a Decomp Buddy job

Each job file is one game repository. Read it and write ONE file: out/<job id>.json (the path is in the job's first line), containing exactly:

{ "plans": { "<target>": <Analysis>, ... one key per target listed in the job ... }, "facts": <Facts> or null }

Write "facts" only when the job says "Facts needed: yes"; otherwise null. Write raw JSON - no prose, no code fences.

## Plan rules (verbatim from the app's planner)
${PLAN_SYSTEM}

## Facts rules (verbatim from the app's facts pass)
${FACTS_SYSTEM}
Facts are read from the README/docs sections of the job.

## Hard checks your answer must pass (import rejects it otherwise)
- Valid against schema-plan.json (each target) and schema-facts.json. Every field present; use null / [] / "" where the docs say nothing.
- build.method "release": release_asset AND release_tag copied character-for-character from the job's release list, and that asset must be inside that tag, and must be for the target's OS/CPU (Windows x64 → a Windows/win64/x64 .zip/.exe/.7z; Linux x64 → linux/AppImage/.tar.*; macOS arm64 → mac/macos/darwin/universal/arm64 .dmg/.zip). No such asset for that target → "source" (if the docs explain building there), else "unsupported" (or "web_only" for browser builds).
- Quotes (completeness_quote, deck_quote, controller_notes) copied verbatim from the README/docs text, max 200 chars.
- Never invent hashes, filenames, or folders the docs don't state - put doubts in "unsure".
`;

async function prep() {
  const all = work(), limit = Number(arg("--limit")) || all.length;
  fs.writeFileSync(J("RULES.md"), RULES);
  fs.writeFileSync(J("schema-plan.json"), JSON.stringify(z.toJSONSchema(Analysis), null, 1));
  fs.writeFileSync(J("schema-facts.json"), JSON.stringify(z.toJSONSchema(Facts), null, 1));
  const manifest = []; let made = 0, skipped = 0, failed = 0, i = 0;
  const todo = all.slice(0, limit);
  async function worker() {
    while (i < todo.length) {
      const w = todo[i++];
      // work() only lists repos still missing something, so an old answer in done/ doesn't count - only one awaiting import does.
      if (fs.existsSync(J("out", `${w.id}.json`))) { skipped++; manifest.push(w); continue; }
      try {
        const ctx = fs.existsSync(J("ctx", `${w.id}.json`)) ? readJSON(J("ctx", `${w.id}.json`)) : await (w.host === "gitlab" ? fetchGitLab : fetchGitHub)({ owner: w.owner, repo: w.repo });
        fs.writeFileSync(J("ctx", `${w.id}.json`), JSON.stringify(ctx));
        const body = renderContext(ctx, { target: w.targets[0] || "windows", preferredTag: w.version || undefined }).split("\n").slice(1).join("\n");
        const head = [
          `ANSWER FILE: ${J("out", `${w.id}.json`)}`,
          `Job id: ${w.id} · Catalog title: ${w.title}`,
          `Targets needed (one plan each): ${w.targets.length ? w.targets.map((t) => `"${t}" = ${targetOf(t).prompt}`).join("; ") : "none"}`,
          `Facts needed: ${w.facts ? "yes" : "no"}`,
          "",
        ].join("\n");
        fs.writeFileSync(J("jobs", `${w.id}.md`), head + body);
        manifest.push(w); made++;
      } catch (err) { failed++; console.log(`✗ ${w.owner}/${w.repo}: ${err.message.slice(0, 120)}`); }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  fs.writeFileSync(J("manifest.json"), JSON.stringify(manifest, null, 1));
  const planJobs = manifest.reduce((n, w) => n + w.targets.length, 0), factsJobs = manifest.filter((w) => w.facts).length;
  console.log(`prep: ${manifest.length} repo job(s) (${made} new, ${skipped} already answered, ${failed} failed) = ${planJobs} plan(s) + ${factsJobs} facts → ${J("jobs")}`);
}

// A "release" plan must point at an asset that exists, inside the tag it names.
function assetProblems(analysis, ctx) {
  const out = [];
  for (const g of analysis.games || []) {
    if (g.build?.method !== "release") continue;
    const rel = (ctx.releases || []).find((r) => r.tag === g.build.release_tag);
    if (!rel) out.push(`${g.game_title}: tag "${g.build.release_tag}" isn't a release`);
    else if (!rel.assets.some((a) => a.name === g.build.release_asset)) out.push(`${g.game_title}: "${g.build.release_asset}" isn't in ${rel.tag}`);
  }
  return out;
}

async function validate(w, ans, ctx) {
  const entry = {}; const problems = [], warnings = [];
  for (const t of w.targets) {
    const raw = ans.plans?.[t];
    if (!raw) { problems.push(`no plan for ${t}`); continue; }
    const parsed = Analysis.safeParse(raw);
    if (!parsed.success) { problems.push(`${t}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`); continue; }
    if (parsed.data.redirect_repo) { problems.push(`${t}: points at ${parsed.data.redirect_repo} - left for the paid planner`); continue; }
    const bad = assetProblems(parsed.data, ctx); if (bad.length) { problems.push(`${t}: ${bad.join("; ")}`); continue; }
    try {
      const items = await analyzeOne(`https://${w.host === "gitlab" ? "gitlab.com" : "github.com"}/${w.owner}/${w.repo}`, { provider: { label: "Claude Code" }, log: () => {}, target: t, fetchContext: async () => ctx, planner: async () => structuredClone(parsed.data) });
      entry.targets = { ...(entry.targets || {}), [t]: { redirect_repo: null, games: items.map((i) => i.plan), generatedBy: "claude-code", generatedAt: new Date().toISOString() } };
    } catch (err) { problems.push(`${t}: ${err.message.slice(0, 120)}`); }
  }
  if (w.facts) {
    const parsed = Facts.safeParse(ans.facts);
    if (!parsed.success) problems.push(`facts: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    else {
      entry.facts = await extractFacts(ctx, { provider: { label: "Claude Code" }, ask: async () => structuredClone(parsed.data) }); entry.factsAt = new Date().toISOString();
      // The app's grounding quietly resets claims the text doesn't back - say which, so the answer can be fixed.
      for (const k of ["completeness", "completeness_quote", "steam_deck", "deck_quote"]) if (JSON.stringify(entry.facts[k]) !== JSON.stringify(parsed.data[k])) warnings.push(`facts.${k} was reset by grounding (${JSON.stringify(parsed.data[k]).slice(0, 60)} → ${JSON.stringify(entry.facts[k]).slice(0, 40)}) - the quote must be verbatim and actually about that`);
      for (const k of ["fullscreen", "resolution", "ultrawide", "vsync"]) if (parsed.data.config?.keys?.[k] && !entry.facts.config?.keys?.[k]) warnings.push(`facts.config.keys.${k} was dropped by grounding`);
    }
  }
  return { entry, problems, warnings };
}

async function importAnswers() {
  const manifest = new Map(readJSON(J("manifest.json")).map((w) => [w.id, w]));
  const file = path.join(DIR, "plans.json");
  const batch = {}; let plans = 0, facts = 0; const rejected = [];
  for (const f of fs.readdirSync(J("out")).filter((n) => n.endsWith(".json"))) {
    const id = f.replace(/\.json$/, ""), w = manifest.get(id);
    const reject = (why) => { rejected.push(`${id}: ${why}`); fs.renameSync(J("out", f), J("rejected", f)); fs.writeFileSync(J("rejected", `${id}.why.txt`), why); };
    if (!w) { reject("not in the manifest"); continue; }
    let ans; try { ans = readJSON(J("out", f)); } catch (err) { reject(`not JSON: ${err.message}`); continue; }
    const ctx = readJSON(J("ctx", `${id}.json`));
    const { entry, problems } = await validate(w, ans, ctx);
    plans += Object.keys(entry.targets || {}).length; if (entry.facts) facts++;
    if (entry.targets || entry.facts) {
      // Repo-level tag/provenance only for a repo with no plans yet - never relabel targets a paid run made.
      batch[w.key] = { ...(entry.targets && !w.hasAnyPlan ? { tag: w.version, generatedAt: new Date().toISOString(), generatedBy: "claude-code" } : {}), ...entry };
    }
    if (problems.length) { rejected.push(`${id}: ${problems.join(" | ")}`); fs.writeFileSync(J("rejected", `${id}.why.txt`), problems.join("\n")); }
    fs.renameSync(J("out", f), J(problems.length && !entry.targets && !entry.facts ? "rejected" : "done", f));
  }
  if (Object.keys(batch).length) writePlans(file, batch);
  console.log(`import: ${plans} plan(s) + ${facts} facts written to ${file}; ${rejected.length} with problems`);
  for (const r of rejected) console.log(`  ✗ ${r.slice(0, 220)}`);
}

// Agents run this on their own answer before moving on: same checks as import, nothing written.
async function check(id) {
  const w = readJSON(J("manifest.json")).find((m) => m.id === id);
  if (!w) { console.log(`✗ ${id}: no such job`); process.exitCode = 1; return; }
  let ans; try { ans = readJSON(J("out", `${id}.json`)); } catch (err) { console.log(`✗ ${id}: answer missing or not JSON (${err.message})`); process.exitCode = 1; return; }
  const { problems, warnings } = await validate(w, ans, readJSON(J("ctx", `${id}.json`)));
  if (problems.length) { console.log(`✗ ${id}:\n  ${problems.join("\n  ")}`); process.exitCode = 1; } else console.log(`✓ ${id} passes`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
}

function status() {
  const m = fs.existsSync(J("manifest.json")) ? readJSON(J("manifest.json")) : [];
  const n = (d) => fs.readdirSync(J(d)).filter((f) => f.endsWith(".json")).length;
  console.log(`jobs ${m.length} · answered-not-imported ${n("out")} · imported ${n("done")} · rejected ${n("rejected")}`);
}

const cmd = process.argv[2];
await (cmd === "prep" ? prep() : cmd === "import" ? importAnswers() : cmd === "check" ? check(process.argv[3]) : cmd === "status" ? status() : Promise.reject(new Error("usage: ccplans.mjs prep|import|status")));
