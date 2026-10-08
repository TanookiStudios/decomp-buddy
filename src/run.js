// Two steps: analyze (read repos, ask Claude) then setup (download, lay out,
// place the user's picked game files, refresh install.html).

import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseRepoUrl, fetchRepoContext as fetchGitHub } from "./github.js";
import { fetchRepoContext as fetchGitLab } from "./gitlab.js";
const fetchRepoContext = (ref) => (ref.host === "gitlab" ? fetchGitLab(ref) : fetchGitHub(ref));
import { planFromContext } from "./plan.js";
import { setupGame } from "./setup.js";
import { sweepMacJunk } from "./junk.js";
import { writeInstallHtml } from "./installhtml.js";
import { writeApplyIconsBat } from "./icons.js";
import { cleanStaging } from "./archive.js";
import { planKey, lookupPlan } from "./plans.js";

export function defaultOutDir() {
  return process.platform === "win32"
    ? path.join(os.homedir(), "Games", "Decomp Buddy")
    : path.join(os.homedir(), "Downloads", "Transfer to PC");
}

// Returns one item per game the repo ships (usually one).
export async function analyzeOne(url, { provider, log, planner = planFromContext, preferredTag, preferredAsset, artworkPath, target = "windows", hints, published = null, fetchContext = fetchRepoContext, onlyGames = null } = {}) {
  let ref = parseRepoUrl(url);
  log(`Reading ${ref.owner}/${ref.repo}…`);
  let ctx = await fetchContext(ref);
  let planSource = "ai";
  const analyze = async () => {
    // A plan Maddie already published for this repo + target? Use it - free, instant, and the same answer everyone gets.
    const pub = published && lookupPlan(published, planKey(ref.host, ref.owner, ref.repo), target);
    if (pub) {
      const stillThere = pub.analysis.games.every((g) => g.build?.method !== "release" || (ctx.releases || []).some((r) => r.assets.some((a) => a.name === g.build.release_asset)));
      if (stillThere) { planSource = "published"; log(`Using the published plan (${pub.tag || "no tag"}, generated ${String(pub.generatedAt).slice(0, 10)}).`); return pub.analysis; }
      log(`Published plan is for ${pub.tag}; this repo has moved on${provider ? " - asking the AI" : ""}.`);
      if (!provider) { planSource = "published-stale"; return pub.analysis; }
    }
    if (!provider) throw new Error("No published plan for this repo yet. Suggest it from Browse so Maddie can add one, or add your own AI key in Settings.");
    const out = await planner(ctx, { provider, log, preferredTag, preferredAsset, target, hints });
    return out.games ? out : { redirect_repo: out.redirect_repo ?? null, games: [out] }; // canned single plans
  };
  let analysis = await analyze();
  if (analysis.redirect_repo) {
    log(`That repo points at ${analysis.redirect_repo} - following it.`);
    ref = parseRepoUrl(analysis.redirect_repo);
    ctx = await fetchContext(ref);
    analysis = await analyze();
  }
  // The model occasionally repeats a game; same title + same asset is one game.
  const seen = new Set();
  analysis.games = analysis.games.filter((g) => { const k = `${g.game_title}|${g.build?.release_asset || ""}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  if (!analysis.games.length) throw new Error("No game found in this repo.");
  if (analysis.games.length > 1) log(`This repo ships ${analysis.games.length} games.`);
  // Picked specific games of a collection in Browse: keep just those (all of them if the titles don't line up).
  // Picked specific games of a collection in Browse: keep exactly those. No match means the plan
  // changed under us - say so rather than quietly setting up every game in the repo.
  if (onlyGames?.length && analysis.games.length > 1) {
    const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const want = new Set(onlyGames.map(norm));
    const kept = analysis.games.filter((g) => want.has(norm(g.game_title)));
    if (!kept.length) throw new Error(`This repo's plan no longer lists ${onlyGames.join(", ")}. Refresh Browse and pick the game again.`);
    analysis.games = kept; log(`Setting up ${kept.length} of them: ${kept.map((g) => g.game_title).join(", ")}`);
  }
  return analysis.games.map((plan) => {
    plan.mods ||= { supported: (plan.mods_method || "none") !== "none", method: plan.mods_method === "none" ? "unknown" : plan.mods_method || "unknown", folder: plan.mods_folder || null, formats: plan.mods_formats || [], notes: plan.mods_notes || "", links: [...String(plan.mods_notes || "").matchAll(/https?:\/\/[^\s)>\]"']+/g)].map((m) => m[0].replace(/[.,;:]+$/, "")).map((u) => ({ label: u.replace(/^https?:\/\//, "").slice(0, 60), url: u })) };
    for (const k of ["mods_method", "mods_folder", "mods_formats", "mods_notes"]) delete plan[k];
    log(`${plan.game_title} (${plan.console}) - ${plan.build.method}; needs ${plan.game_files.length} game file(s)`);
    return { id: randomUUID(), url, ctx, plan, artworkPath: artworkPath || null, target, planSource };
  });
}

// entries: url strings, or { url, preferredTag, artworkPath } from the catalog browser
export async function analyzeBatch(entries, { provider, log = () => {}, planner, target = "windows", published = null, fetchContext } = {}) {
  const items = [];
  for (const e of entries.map((x) => (typeof x === "string" ? { url: x.trim() } : { ...x, url: String(x.url || "").trim() })).filter((x) => x.url)) {
    const { url } = e;
    try {
      for (const item of await analyzeOne(url, { provider, log, planner, preferredTag: e.preferredTag, preferredAsset: e.preferredAsset, artworkPath: e.artworkPath, target: e.target || target, hints: e.hints, published, onlyGames: e.onlyGames, ...(fetchContext ? { fetchContext } : {}) })) items.push({ ok: true, ...item });
    } catch (err) {
      log(`✗ ${url}: ${err.message}`);
      items.push({ ok: false, id: randomUUID(), url, error: err.message });
    }
  }
  return items;
}

// items: [{ id, url, ctx, plan, picks? }] where picks = { [gameFileIndex]: absolutePath }
// Up to `parallel` games at once (downloads are the slow part); each game's log lines are prefixed
// so interleaved progress stays readable. ctrl pauses/resumes/cancels every download in the run.
export async function setupBatch(items, { outDir = defaultOutDir(), mode = "move", log = () => {}, keep = [], ctrl = null, parallel = 3 } = {}) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++; if (i >= items.length) return;
      const item = items[i];
      const tag = items.length > 1 ? `[${item.plan?.game_title || item.url}] ` : "";
      const glog = (m) => log(`${tag}${m}`);
      try {
        if (ctrl?.cancelled) throw new Error("Cancelled.");
        results[i] = { url: item.url, ok: true, manifest: await setupGame({ plan: item.plan, ctx: item.ctx, outDir, picks: item.picks, verifications: item.verifications, artworkPath: item.artworkPath, target: item.target || "windows", mode, log: glog, keep, ctrl }) };
      } catch (err) {
        glog(`✗ ${item.url}: ${err.message}`);
        results[i] = { url: item.url, ok: false, error: err.message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, items.length)) }, worker));
  cleanStaging(outDir);
  const junk = sweepMacJunk(outDir, { keepIcons: true });
  if (junk.length) log(`Removed ${junk.length} Mac junk file(s).`);
  if (process.platform !== "win32" && items.some((i) => (i.target || "windows") === "windows")) writeApplyIconsBat(outDir);
  const { file, count } = writeInstallHtml(outDir);
  log(`install.html lists ${count} game(s): ${file}`);
  return { results, installHtml: file, outDir };
}

// One shot, no picks (CLI).
export async function runBatch(urls, { outDir = defaultOutDir(), provider, log = () => {}, planner, target = "windows", published = null } = {}) {
  const analyzed = await analyzeBatch(urls, { provider, log, planner, target, published });
  const { results, installHtml } = await setupBatch(analyzed.filter((i) => i.ok), { outDir, log });
  for (const i of analyzed.filter((i) => !i.ok)) results.push({ url: i.url, ok: false, error: i.error });
  return { results, installHtml, outDir };
}
