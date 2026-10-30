// The merged, deduped catalog as one public JSON (see scripts/build-catalog.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchCatalog, artUrl } from "./catalog.js";
import { enrichBoxart } from "./boxart.js";
import { enrichSteamGrid } from "./steamgriddb.js";
import { pipelineStatus } from "./pipeline.js";
import { releaseBuilds, scanKey } from "./scan.js";
import { fetchPublished, planKey } from "./plans.js";
import { fetchSharedSources } from "./sources/shared-sources.js";
import { expandMultiGame, attachFacts, slug, artworkUrl } from "./expand.js";
import { promoteReady, readWaiting, waitingFileNextTo, withoutExcluded } from "./waiting.js";
import { stampListed } from "./listed.js";

export const SCHEMA_VERSION = 1;
const projectArt = (entry, g) => { for (const t of Object.values(entry?.targets || {})) for (const pg of t?.games || []) { const u = pg.artwork_url && artworkUrl(pg.artwork_url, g); if (u) return u; } return null; };

// A list that only knew the repo's code name ("MediEvilRecomp", "conker64 recompiled") gets the game's own name from
// its published plan. Returns the page addresses the old name had, so the site can forward them; null if unchanged.
const compact = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function renameFromPlan(g, entry) {
  if (!entry || g.repoGames) return null;
  const names = [...new Set(Object.values(entry.targets || {}).flatMap((t) => (t?.games || []).map((x) => x.game_title)).filter(Boolean))];
  const codeName = !/\s/.test(g.title.trim()) || compact(g.repo).includes(compact(g.title));
  if (names.length !== 1 || !codeName || compact(names[0]) === compact(g.title)) return null;
  const old = slug(`${g.title}-${g.console}`);
  g.title = names[0];
  return [old, `${old}-${slug(g.owner || g.project)}`];
}

export async function buildCatalog({ site = path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site"), log = console.log, recheck = false, steamGridKey = null } = {}) {
  const dir = path.join(site, "public", "decomp-buddy");
  const findsFile = path.join(dir, "finds.json");
  const cacheDir = path.join(os.homedir(), ".decomp-buddy", "catalog-build"); fs.mkdirSync(cacheDir, { recursive: true });
  // Anything on Coming Soon that now has a download joins the catalog (checked at most every 6 hours; --recheck forces it).
  await promoteReady({ findsFile, log, stampFile: path.join(cacheDir, "waiting-checked"), force: recheck });
  const pub = await fetchPublished({ file: path.join(dir, "plans.json") });
  const shared = await fetchSharedSources({ file: path.join(dir, "sources.json") });
  const cat = await fetchCatalog({ cacheDir, refresh: true, config: { shared, findsFile } });
  const games = attachFacts(expandMultiGame(withoutExcluded(cat.games, readWaiting(waitingFileNextTo(findsFile))), pub), pub); // waiting + hidden stay out, whichever source lists them
  // Real names before any cover lookup: "MediEvil" finds a cover, "MediEvilRecomp" doesn't.
  for (const g of games) g.formerSlugs = renameFromPlan(g, g.owner && pub.plans?.[planKey(g.repoHost || "github", g.owner, g.repo)]);
  await enrichBoxart(games, { cacheDir });
  // Covers picked by judgment for titles the matcher can't settle (scripts/boxart-picks.mjs).
  let picks = {}; try { picks = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".decomp-buddy-boxart", "picks.json"), "utf8")); } catch {}
  // A SteamGridDB outage must not stop a publish: the games just keep the art they had.
  if (steamGridKey) await enrichSteamGrid(games, { cacheDir, key: steamGridKey, log, picks }).catch((err) => log(`✗ steamgriddb skipped: ${err.message}`));
  const seenSlugs = new Map();
  // Download sizes from the malware scan's records: a game's biggest download (the "Under 100 MB" list).
  let scans = {}; try { scans = JSON.parse(fs.readFileSync(path.join(dir, "scans.json"), "utf8")).files || {}; } catch {}
  const sizeOf = (entry, key) => Math.max(0, ...releaseBuilds({ plans: { [key]: entry || {} } }).map((b) => scans[scanKey(key, b.build)]?.size || 0)) || null;
  let out = games.map((g) => {
    let s = slug(`${g.title}-${g.console}`); const n = (seenSlugs.get(s) || 0) + 1; seenSlugs.set(s, n); if (n > 1) s = `${s}-${slug(g.owner || g.project)}`;
    // Same game, same owner, two repos: the repo name keeps the page addresses apart.
    if (n > 1 && seenSlugs.has(s)) s = `${s}-${slug(g.repo || g.project)}`; if (n > 1) seenSlugs.set(s, 1);
    const entry = g.owner && pub.plans?.[planKey(g.repoHost || "github", g.owner, g.repo)];
    return {
      id: g.id, slug: s, ...(g.formerSlugs ? { formerSlugs: g.formerSlugs } : {}), title: g.title, console: g.console, project: g.project || null,
      repo: g.owner ? `${g.owner}/${g.repo}` : null, repoUrl: g.repoUrl || null, host: g.repoHost || (g.owner ? "github" : null),
      // No icon and no box art: the project's own artwork from its install steps (what the app shows too).
      website: g.website || null, iconUrl: artUrl(g, false) || projectArt(entry, g) || null, boxartUrl: g.boxartUrl || null,
      platforms: g.platforms || [], version: g.version || null, latestVersion: g.latestVersion || null, status: g.status || "unknown", updatedAt: g.updatedAt || null,
      sources: g.sources || [g.source].filter(Boolean), description: g.description || null, repoGames: g.repoGames || null,
      plan: entry ? { targets: Object.keys(entry.targets || {}), generatedAt: entry.generatedAt || null } : null,
      scan: g.scan || null,
      listedAt: null,
      size: entry ? sizeOf(entry, planKey(g.repoHost || "github", g.owner, g.repo)) : null,
      credits: g.credits ? g.credits.map(({ login, avatar }) => ({ login, avatar })) : null,
      recommended: g.recommended ? { tag: g.recommended.tag, badTag: g.recommended.badTag } : null,
      trust: g.trust ? { uploadedBy: g.trust.uploadedBy || null, uploaders: g.trust.uploaders || [], license: g.trust.license ?? null, ownerSince: g.trust.ownerSince || null, ownerIsOrg: !!g.trust.ownerIsOrg } : null,
      facts: g.facts ? { completeness: g.facts.completeness, completenessQuote: g.facts.completeness_quote || null, steamDeck: g.facts.steam_deck, deckQuote: g.facts.deck_quote || null, aiUse: g.facts.ai_use || null, aiQuote: g.facts.ai_quote || null, features: g.facts.features || null, archived: !!g.facts.health?.archived, pushedAt: g.facts.health?.pushedAt || null, takedown: !!g.facts.health?.dmca } : null,
    };
  });
  // A download a virus scanner flagged keeps its game out of the catalog until it has been reviewed (scans.json "cleared").
  const held = out.filter((g) => g.scan?.flagged);
  for (const g of held) log(`held: ${g.title} (${g.repo}) - a download was flagged by the malware scan`);
  out = out.filter((g) => !g.scan?.flagged);
  // Live only when the process is done: install steps written and every download scanned (a game built from source
  // has nothing to scan). Until then it waits on the Addition Queue - Maddie, 26 Oct 2026: "We go live when it's
  // safe. When our process is done."
  const scanless = (g) => { const [owner, repo] = String(g.repo || "").split("/"); const e = pub.plans?.[planKey(g.host || "github", owner, repo)]; return !e || !releaseBuilds({ plans: { x: e } }).length; };
  const queued = out.filter((g) => !g.plan || (!g.scan && !scanless(g)));
  out = out.filter((g) => !queued.includes(g));
  log(`queued: ${queued.length} game(s) wait for install steps or their scan`);
  // First-listed dates (New Ports feed): kept between builds; hand-found games keep the day they were found.
  const seenFile = path.join(cacheDir, "first-seen.json"); let seen = {}; try { seen = JSON.parse(fs.readFileSync(seenFile, "utf8")); } catch {}
  let addedAt = {}; try { for (const f of JSON.parse(fs.readFileSync(findsFile, "utf8")).games || []) if (f.repo && f.addedAt) addedAt[f.repo.toLowerCase()] = f.addedAt; } catch {}
  stampListed(out, seen, { addedAt, today: new Date().toISOString().slice(0, 10), baseline: "2026-09-13" });
  fs.writeFileSync(seenFile, JSON.stringify(seen));
  const doc = { schema: SCHEMA_VERSION, generatedAt: new Date().toISOString(), count: out.length, sources: Object.fromEntries(Object.entries(cat.perSource || {}).map(([k, v]) => [k, { label: v.label || k, url: v.url || null, count: v.count || 0 }])), games: out };
  const file = path.join(dir, "catalog.json");
  const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(doc)); fs.renameSync(tmp, file);
  // Coming Soon gets covers from the same matchers, kept on each waiting.json entry so the website and the app can show them.
  const wfile = waitingFileNextTo(findsFile);
  if (fs.existsSync(wfile)) {
    const wdoc = JSON.parse(fs.readFileSync(wfile, "utf8")), had = wdoc.games.filter((g) => g.boxartUrl).length;
    await enrichBoxart(wdoc.games, { cacheDir });
    if (steamGridKey) await enrichSteamGrid(wdoc.games, { cacheDir, key: steamGridKey, log, picks }).catch((err) => log(`✗ steamgriddb skipped: ${err.message}`));
    const has = wdoc.games.filter((g) => g.boxartUrl).length;
    if (has !== had) { const t = `${wfile}.tmp`; fs.writeFileSync(t, JSON.stringify(wdoc, null, 2) + "\n"); fs.renameSync(t, wfile); }
    log(`waiting.json: ${has} of ${wdoc.games.length} Coming Soon games have box art`);
  }
  // Where every game is in the process (admin page, status pages, submitter emails).
  const blocked = held.map((g) => ({ title: g.title, console: g.console, repo: g.repo, host: g.host || "github", version: g.version }));
  const status = pipelineStatus({ catalog: doc, waiting: fs.existsSync(wfile) ? JSON.parse(fs.readFileSync(wfile, "utf8")) : {}, plans: pub, blocked, queued });
  const sfile = path.join(dir, "status.json"); fs.writeFileSync(`${sfile}.tmp`, JSON.stringify(status)); fs.renameSync(`${sfile}.tmp`, sfile);
  log(`status.json: ${Object.entries(status.counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  log(`catalog.json: ${out.length} games (${out.filter((g) => g.plan).length} with published plans, ${out.filter((g) => g.facts).length} with facts) -> ${file}`);
  return { file, count: out.length };
}

