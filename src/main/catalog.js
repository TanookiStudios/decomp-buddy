// Moved out of main.js unchanged (2026-09-23): catalog IPC handlers.
import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fetchCatalog, iconFor, installedIndex } from "../catalog.js";
import { enrichBoxart } from "../boxart.js";
import { fetchPublished, planKey } from "../plans.js";
import { fetchSharedSources } from "../sources/shared-sources.js";
import { loadSettings, saveSettings, defaultFindsFile, plansFileFor, sourcesFileFor, libraryDirs, state } from "./core.js";
import { expandMultiGame, attachFacts } from "../expand.js";
import { sampleStat } from "./core.js";
import { getWaiting } from "./finding.js";
import { withoutExcluded } from "../waiting.js";

// --- portsdr.com catalog
// A repo that ships several games (a "10 PSX games" collection) is one repo but ten games: once its
// published plan exists, Browse shows one card per game, each addable on its own.
export { expandMultiGame } from "../expand.js";
// GitHub says the repo is gone: hide it for a week, then let the next generation run look again
// (a repo can come back - made public again, a takedown reversed). Admin can unhide by hand.
const DEAD_FOR = 7 * 24 * 3600 * 1000;
export function markDead(s, key) { s.deadRepos = { ...(s.deadRepos || {}), [key.toLowerCase()]: new Date().toISOString() }; saveSettings(s); }
export const isDead = (s, key) => { const at = (s.deadRepos || {})[String(key).toLowerCase()]; return !!at && Date.now() - Date.parse(at) < DEAD_FOR; };
ipcMain.handle("deadRepos:list", () => Object.entries(loadSettings().deadRepos || {}).map(([repo, at]) => ({ repo, at, hidden: Date.now() - Date.parse(at) < DEAD_FOR })));
ipcMain.handle("deadRepos:unhide", (_e, { repo }) => { const s = loadSettings(); if (s.deadRepos) delete s.deadRepos[String(repo).toLowerCase()]; saveSettings(s); return true; });
// Newest release tag straight from GitHub for each installed repo - the catalogs can lag, GitHub can't.
async function liveTagsFor(repoKeys) {
  const out = {};
  await Promise.all(repoKeys.slice(0, 50).map(async (key) => {
    try {
      const res = await fetch(`https://api.github.com/repos/${key}/releases?per_page=5`, { headers: { "User-Agent": "decomp-buddy", Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return;
      const rel = (await res.json()).find((r) => !r.draft);
      if (rel) out[key.toLowerCase()] = { tag: rel.tag_name, status: rel.prerelease ? "prerelease" : "latest", updatedAt: rel.published_at, url: rel.html_url };
    } catch {}
  }));
  return out;
}

ipcMain.handle("catalog:get", async (_e, { refresh = true, checkInstalled = false } = {}) => {
  const st = loadSettings();
  const cfg = { ...(st.sources || {}), shared: await fetchSharedSources({ file: sourcesFileFor(st) }), localFinds: st.localFinds || [], findsFile: st.findsFile || defaultFindsFile() };
  const cat = await fetchCatalog({ cacheDir: app.getPath("userData"), refresh, config: cfg });
  const pub = await fetchPublished({ file: plansFileFor(st), cacheDir: app.getPath("userData") }).catch(() => null);
  const waiting = await getWaiting().catch(() => null); // no list (first run offline): nothing is held back
  // The published waiting/hidden lists curate the catalog; they never hide a game you added yourself.
  const yours = (g) => [g.source, ...(g.sources || [])].includes("local-finds");
  const live = cat.games.filter((g) => !g.owner || !isDead(st, `${g.owner}/${g.repo}`));
  cat.games = expandMultiGame([...withoutExcluded(live.filter((g) => !yours(g)), waiting), ...live.filter(yours)], pub);
  attachFacts(cat.games, pub);
  await enrichBoxart(cat.games, { cacheDir: app.getPath("userData") }); // collection cards, one per game
  state.catalogGames = cat.games;
  sampleStat("catalog", { games: cat.games.length, perSource: Object.fromEntries(Object.entries(cat.perSource || {}).map(([k, v]) => [k, v.count || 0])) });
  // Installed = anything in either folder.
  const s = loadSettings();
  const installed = {};
  for (const dir of libraryDirs(s)) {
    for (const [k, v] of Object.entries(installedIndex(dir))) installed[k] = [...(installed[k] || []), ...v.map((x) => ({ ...x, dir }))];
  }
  if (checkInstalled) {
    const live = await liveTagsFor(Object.keys(installed));
    for (const g of cat.games) {
      const l = g.owner && !g.gameOf && live[`${g.owner}/${g.repo}`.toLowerCase()]; // collection games keep their own tag
      if (l) Object.assign(g, { version: l.tag, status: l.status, updatedAt: l.updatedAt || g.updatedAt, releaseUrl: l.url, liveChecked: true });
    }
  }
  return { games: cat.games, fetchedAt: cat.fetchedAt, perSource: Object.fromEntries(Object.entries(cat.perSource || {}).map(([k, v]) => [k, { label: v.label || k, count: v.count, error: v.error || null }])), stale: !!cat.stale, error: cat.error || null, installed };
});
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".svg": "image/svg+xml" };
ipcMain.handle("catalog:icon", async (_e, { id }) => {
  const game = state.catalogGames.find((g) => g.id === id);
  const file = game && (await iconFor(game, { cacheDir: app.getPath("userData"), preferBoxart: !!loadSettings().preferBoxart }));
  if (!file) return null;
  return { path: file, dataUrl: `data:${MIME[path.extname(file).toLowerCase()] || "image/png"};base64,${fs.readFileSync(file).toString("base64")}` };
});
