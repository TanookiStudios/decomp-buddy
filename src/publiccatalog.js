// The merged, deduped catalog as one public JSON (see scripts/build-catalog.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchCatalog, artUrl } from "./catalog.js";
import { enrichBoxart } from "./boxart.js";
import { fetchPublished, planKey } from "./plans.js";
import { fetchSharedSources } from "./sources/shared-sources.js";
import { expandMultiGame, attachFacts, slug } from "./expand.js";
import { promoteReady, readWaiting, waitingFileNextTo, withoutExcluded } from "./waiting.js";

export const SCHEMA_VERSION = 1;

export async function buildCatalog({ site = path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site"), log = console.log } = {}) {
  const dir = path.join(site, "public", "decomp-buddy");
  const findsFile = path.join(dir, "finds.json");
  await promoteReady({ findsFile, log }); // anything on Waiting For A Port that now has a download joins the catalog
  const pub = await fetchPublished({ file: path.join(dir, "plans.json") });
  const shared = await fetchSharedSources({ file: path.join(dir, "sources.json") });
  const cacheDir = path.join(os.homedir(), ".decomp-buddy", "catalog-build"); fs.mkdirSync(cacheDir, { recursive: true });
  const cat = await fetchCatalog({ cacheDir, refresh: true, config: { shared, findsFile } });
  const games = attachFacts(expandMultiGame(withoutExcluded(cat.games, readWaiting(waitingFileNextTo(findsFile))), pub), pub); // waiting + hidden stay out, whichever source lists them
  await enrichBoxart(games, { cacheDir });
  const seenSlugs = new Map();
  const out = games.map((g) => {
    let s = slug(`${g.title}-${g.console}`); const n = (seenSlugs.get(s) || 0) + 1; seenSlugs.set(s, n); if (n > 1) s = `${s}-${slug(g.owner || g.project)}`;
    const entry = g.owner && pub.plans?.[planKey(g.repoHost || "github", g.owner, g.repo)];
    return {
      id: g.id, slug: s, title: g.title, console: g.console, project: g.project || null,
      repo: g.owner ? `${g.owner}/${g.repo}` : null, repoUrl: g.repoUrl || null, host: g.repoHost || (g.owner ? "github" : null),
      website: g.website || null, iconUrl: artUrl(g, false) || null, boxartUrl: g.boxartUrl || null,
      platforms: g.platforms || [], version: g.version || null, status: g.status || "unknown", updatedAt: g.updatedAt || null,
      sources: g.sources || [g.source].filter(Boolean), description: g.description || null, repoGames: g.repoGames || null,
      plan: entry ? { targets: Object.keys(entry.targets || {}), generatedAt: entry.generatedAt || null } : null,
      facts: g.facts ? { completeness: g.facts.completeness, completenessQuote: g.facts.completeness_quote || null, steamDeck: g.facts.steam_deck, deckQuote: g.facts.deck_quote || null, archived: !!g.facts.health?.archived, pushedAt: g.facts.health?.pushedAt || null, takedown: !!g.facts.health?.dmca } : null,
    };
  });
  const doc = { schema: SCHEMA_VERSION, generatedAt: new Date().toISOString(), count: out.length, sources: Object.fromEntries(Object.entries(cat.perSource || {}).map(([k, v]) => [k, { label: v.label || k, url: v.url || null, count: v.count || 0 }])), games: out };
  const file = path.join(dir, "catalog.json");
  const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(doc)); fs.renameSync(tmp, file);
  log(`catalog.json: ${out.length} games (${out.filter((g) => g.plan).length} with published plans, ${out.filter((g) => g.facts).length} with facts) -> ${file}`);
  return { file, count: out.length };
}

