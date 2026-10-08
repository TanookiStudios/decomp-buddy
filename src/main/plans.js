// Published plans: status, generation (plans + facts), cancel.
import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fetchPublished, writePlans, planKey, TARGET_OF_PLATFORM, PLANS_URL } from "../plans.js";
import { sampleStat, logTo, safeSend, loadSettings, activeProvider, plansFileFor, state } from "./core.js";
import { markDead } from "./catalog.js";
import { extractFacts, FACTS_VERSION } from "../facts.js";

// ---------- Published plans (admin generates, everyone downloads) ----------
// Each repo can need: a plan per Build For target it has builds for, and one facts pass
// (completeness, Steam Deck, saves, config, controllers - see src/facts.js).
const PLAN_USD = 0.04, FACTS_USD = 0.015;
// Anything bigger than this needs an explicit yes (confirmedJobs) - a stray click shouldn't be a bill.
const CONFIRM_ABOVE = 20;
let genState = null;
const hintsFor = (g) => [g.region && `region ${g.region}`, g.serial && `disc serial ${g.serial}`, g.bios && `BIOS model ${g.bios}`, g.discs > 1 && `${g.discs} discs (one game file per disc)`].filter(Boolean).join(", ") || undefined;
function workFor(games, pub, only) {
  const work = [];
  for (const g of games) {
    if (only && !only.has(`${g.owner}/${g.repo}`.toLowerCase())) continue;
    const targets = [...new Set((g.platforms || []).flatMap((p) => TARGET_OF_PLATFORM[p] || []))]; if (!targets.length) targets.push("windows");
    const key = planKey(g.repoHost, g.owner, g.repo); const entry = pub.plans?.[key] || {};
    const missing = targets.filter((t) => !entry.targets?.[t]);
    const facts = !entry.facts || (entry.facts.version || 0) < FACTS_VERSION;
    if (missing.length || facts) work.push({ g, key, targets: missing, facts });
  }
  const planJobs = work.reduce((n, w) => n + w.targets.length, 0), factsJobs = work.filter((w) => w.facts).length;
  return { work, planJobs, factsJobs, jobs: planJobs + factsJobs, estimateUsd: +(planJobs * PLAN_USD + factsJobs * FACTS_USD).toFixed(2) };
}
ipcMain.handle("plans:status", async () => {
  const s = loadSettings();
  const file = plansFileFor(s);
  const pub = await fetchPublished({ file, cacheDir: app.getPath("userData") });
  const games = plannableGames(s);
  const w = workFor(games, pub, null);
  const inCatalog = new Set(games.map((g) => planKey(g.repoHost, g.owner, g.repo)));
  const keys = Object.keys(pub.plans || {}).filter((k) => inCatalog.has(k));
  sampleStat("plans", { published: keys.length, total: games.length });
  return { file, total: games.length, published: keys.length, withFacts: keys.filter((k) => pub.plans[k].facts).length, missing: w.work.length, jobs: w.jobs, planJobs: w.planJobs, factsJobs: w.factsJobs, estimateUsd: w.estimateUsd, running: !!genState, updatedAt: pub.updatedAt || null };
});
// Catalog games plus pending finds (not on a catalog until published), one entry per repo.
export function plannableGames(s) {
  const pendingGames = (s.localFinds || []).map((p) => { const [owner, repo] = String(p.repo).split("/"); return { ...p, owner, repo, repoHost: "github", repoUrl: `https://github.com/${p.repo}` }; });
  const seen = new Set();
  // Collection cards (one per game) fold back into their repo: plans are per repo, not per game.
  const repoLevel = state.catalogGames.map((g) => (g.gameOf ? { ...g, id: g.gameOf, title: g.repo, version: g.repoVersion } : g));
  return [...repoLevel, ...pendingGames].filter((g) => g.owner && g.repoUrl).filter((g) => { const k = `${g.owner}/${g.repo}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
// Generate plans (and facts) for catalog games that lack them, or (repos given) just those repos -
// pending finds included, so a game gets its plan the moment it's imported.
export async function generatePlans(sender, { limit, repos, confirmedJobs, trigger = "Generate Missing" } = {}) {
  if (genState) throw new Error("Already generating.");
  const s = loadSettings();
  const provider = activeProvider(s);
  const file = plansFileFor(s);
  if (!file) throw new Error("No site folder configured.");
  if (!fs.existsSync(path.dirname(file))) throw new Error(`The site folder ${path.dirname(file)} doesn't exist.`);
  const log = (m) => logTo(sender, m);
  // No plans.json in the site checkout yet: start it from the live feed, never from nothing. A file
  // holding only this run's plans would replace every published plan the moment it's deployed.
  if (!fs.existsSync(file)) {
    let live = null;
    try { const res = await fetch(PLANS_URL, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(20_000), cache: "no-store" }); if (res.ok) live = await res.json(); } catch {}
    if (!live?.plans) throw new Error(`${file} is missing and the published plans couldn't be downloaded - refusing to start a new file that would replace them.`);
    writePlans(file, live.plans);
    log(`Started ${file} from the published feed (${Object.keys(live.plans).length} repos).`);
  }
  const pub = await fetchPublished({ file, cacheDir: app.getPath("userData") });
  const only = repos && new Set(repos.map((r) => r.toLowerCase()));
  const plan = workFor(plannableGames(s), pub, only);
  const total = limit ? Math.min(limit, plan.jobs) : plan.jobs;
  if (total > CONFIRM_ABOVE && confirmedJobs !== total) {
    log(`Not started: ${total} jobs (~$${plan.estimateUsd}) needs a yes first.`);
    return { done: 0, failed: 0, cancelled: false, needsConfirm: total, estimateUsd: plan.estimateUsd };
  }
  const { analyzeOne } = await import("../run.js");
  const { parseRepoUrl, fetchRepoContext: fetchGitHub } = await import("../github.js");
  const { fetchRepoContext: fetchGitLab } = await import("../gitlab.js");
  genState = { cancelled: false };
  let done = 0, failed = 0, batch = {};
  const tick = () => { if (done % 10 === 0 && Object.keys(batch).length) { writePlans(file, batch); batch = {}; } safeSend(sender, "plans:progress", { done, failed, total }); };
  log(`--- Generate plans (${provider.label} ${provider.model}) - ${trigger}: ${plan.planJobs} plan(s), ${plan.factsJobs} facts pass(es), ~$${plan.estimateUsd}`);
  // Out of credit or a bad key fails every job the same way: stop at the first one and say so.
  const FATAL = /credit balance|billing|invalid.{0,10}api.?key|authentication_error|permission_error|x-api-key/i;
  let fatal = null;
  const checkFatal = (err) => { if (FATAL.test(err.message)) { fatal = /credit|billing/i.test(err.message) ? "Your AI account is out of credit - top it up, then Generate Missing picks up where this stopped." : "The AI provider refused the key - check it in Settings."; genState.cancelled = true; log(`Stopped: ${fatal}`); } };
  try {
    for (const { g, key, targets, facts } of plan.work) {
      let ctx = null;
      for (const t of targets) {
        if (genState.cancelled || done + failed >= total) break;
        try {
          const asset = g.assets?.[t] ? g.assets[t].split("/").pop() : undefined;
          const items = await analyzeOne(g.repoUrl, { provider, log: () => {}, target: t, preferredTag: g.version || undefined, preferredAsset: asset, hints: hintsFor(g) });
          ctx ||= items[0]?.ctx;
          batch[key] = { ...(batch[key] || {}), tag: g.version || null, generatedAt: new Date().toISOString(), targets: { ...(batch[key]?.targets || {}), [t]: { redirect_repo: null, games: items.map((i) => i.plan) } } };
          done++; log(`✓ ${g.title} [${t}] ${items.map((i) => i.plan.game_title).join(", ")}`);
        } catch (err) {
          failed++; log(`✗ ${g.title} [${t}]: ${err.message.slice(0, 160)}`); checkFatal(err);
          if (/^Repo not found/.test(err.message)) { markDead(loadSettings(), `${g.owner}/${g.repo}`); log(`  ${g.owner}/${g.repo} is gone from GitHub - hidden from Browse`); }
        }
        tick();
      }
      if (!facts || genState.cancelled || done + failed >= total) continue;
      try {
        if (!ctx) { const ref = parseRepoUrl(g.repoUrl); ctx = await (ref.host === "gitlab" ? fetchGitLab(ref) : fetchGitHub(ref)); }
        const f = await extractFacts(ctx, { provider });
        batch[key] = { ...(batch[key] || {}), facts: f, factsAt: new Date().toISOString() };
        done++; log(`✓ ${g.title} [facts] ${f.completeness}${f.steam_deck !== "none" ? `, Deck ${f.steam_deck}` : ""}${f.health.archived ? ", archived" : ""}`);
      } catch (err) {
        failed++; log(`✗ ${g.title} [facts]: ${err.message.slice(0, 160)}`); checkFatal(err);
        if (/^Repo not found/.test(err.message)) markDead(loadSettings(), `${g.owner}/${g.repo}`);
      }
      tick();
    }
    log(`plans: ${done} done, ${failed} failed${fatal ? " (stopped)" : genState.cancelled ? " (cancelled)" : ""}`);
    return { done, failed, cancelled: genState.cancelled && !fatal, fatal };
  } finally {
    // Paid-for work is saved whatever happens (window closed, error mid-run).
    if (Object.keys(batch).length) { try { writePlans(file, batch); } catch (err) { logTo(null, `plans: couldn't save ${Object.keys(batch).length} entr(ies): ${err.message}`); } }
    genState = null;
  }
}
ipcMain.handle("plans:generate", (e, opts = {}) => generatePlans(e.sender, opts));
// After an admin import: plan the new repos right away, in the background. No key or a run already
// going = say so in the log; Generate Missing Plans picks them up later either way.
export function planNewFinds(sender, repos) {
  if (!repos.length) return;
  generatePlans(sender, { repos, trigger: `Admin import (${repos.length} repo${repos.length === 1 ? "" : "s"})` })
    .then((r) => { if (r.needsConfirm) logTo(sender, `${r.needsConfirm} plans for the new finds are waiting - Admin → Published Plans → Generate Missing.`); })
    .catch((err) => logTo(sender, `plans for new finds skipped: ${err.message}`));
}
ipcMain.handle("plans:cancel", () => { if (genState) genState.cancelled = true; return true; });
