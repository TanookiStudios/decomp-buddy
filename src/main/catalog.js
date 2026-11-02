// Moved out of main.js unchanged (2026-09-23): catalog IPC handlers.
import { app, ipcMain, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fetchCatalog, iconFor, installedIndex, BUILTIN } from "../catalog.js";
import { savedAppCatalog, fetchAppCatalog } from "../appcatalog.js";
import { dirSize } from "../gametools.js";
import { fetchPublished, planKey } from "../plans.js";
import { loadSettings, saveSettings, defaultFindsFile, plansFileFor, appCatalogFileFor, libraryDirs, state, isNetworkError } from "./core.js";
import { expandMultiGame, attachFacts } from "../expand.js";
import { sampleStat } from "./core.js";
import { pickGames } from "../pick.js";
import { buildLists, LISTS } from "../lists.js";

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

ipcMain.handle("catalog:get", (_e, opts = {}) => loadCatalog(opts));
// Lists (src/lists.js) over the catalog Browse last loaded; the two that need the website's data are left out.
ipcMain.handle("lists:get", () => { const l = buildLists(state.catalogGames); return LISTS.filter((x) => !x.needs).map((x) => ({ slug: x.slug, title: x.title, ids: l[x.slug].map((g) => g.id) })); });
// What Should I Play? (src/pick.js) over the catalog Browse last loaded.
ipcMain.handle("pick:games", (_e, answers = {}) => { const r = pickGames(state.catalogGames, answers); return { relaxed: r.relaxed, ids: r.picks.map((g) => g.id) }; });
// The merged catalog as Browse shows it (also used by the background update check, with no window open).
export async function loadCatalog({ refresh = true, checkInstalled = false, savedOnly = false } = {}) {
  // The published catalog: the copy on disk (or built into the app) at once; savedOnly never touches the network,
  // and Browse shows that while the full load checks the website for a newer copy (src/appcatalog.js).
  const st = loadSettings(), cacheDir = app.getPath("userData"), file = appCatalogFileFor(st);
  let doc = savedAppCatalog({ cacheDir, file }), error = null;
  if (refresh && !savedOnly) {
    try { doc = await fetchAppCatalog({ cacheDir, file }); }
    catch (err) { error = isNetworkError(err) ? (err.name === "TimeoutError" ? "the website didn't answer in time" : "you're offline") : err.message; }
  }
  if (!doc) { if (savedOnly) return { games: [], installed: {} }; throw new Error(`Couldn't load the catalog: ${error || "no copy on this computer yet"}.`); }
  const off = st.sources?.builtin || {};
  let games = doc.games.filter((g) => !(g.sources || [g.source]).filter(Boolean).every((id) => off[id] === false)); // sources switched off in Settings
  // Your own additions (Settings → Sources) aren't on the published list: those are still read on this computer.
  const listed = new Set(games.filter((g) => g.owner).map((g) => `${g.owner}/${g.repo}`.toLowerCase()));
  const own = savedOnly ? [] : await ownSources(st, cacheDir, listed);
  games = [...games, ...own].filter((g) => !g.owner || !isDead(st, `${g.owner}/${g.repo}`));
  state.catalogGames = games;
  sampleStat("catalog", { games: games.length, perSource: Object.fromEntries(Object.entries(doc.sources || {}).map(([k, v]) => [k, v.count || 0])) });
  const cat = { games, fetchedAt: doc.generatedAt, perSource: doc.sources || {}, stale: !!error, error, from: doc.from };
  // Installed = anything in either folder.
  const s = loadSettings();
  const installed = {};
  for (const dir of libraryDirs(s)) {
    for (const [k, v] of Object.entries(installedIndex(dir))) installed[k] = [...(installed[k] || []), ...v.map((x) => ({ ...x, dir }))];
  }
  if (checkInstalled) {
    // Published games carry their newest version from the hourly build; only your own additions ask GitHub.
    const live = await liveTagsFor(Object.keys(installed).filter((k) => !listed.has(k.toLowerCase())));
    for (const g of cat.games) {
      const l = g.owner && !g.gameOf && live[`${g.owner}/${g.repo}`.toLowerCase()]; // collection games keep their own tag
      // With published steps, the version that installs is theirs; GitHub's newest just waits beside it (follow.mjs moves it).
      if (l && g.publishedTag) { if (l.tag !== g.version) g.latestVersion = l.tag; g.liveChecked = true; }
      else if (l) Object.assign(g, { version: l.tag, status: l.status, updatedAt: l.updatedAt || g.updatedAt, releaseUrl: l.url, liveChecked: true });
    }
  }
  return { games: cat.games, fetchedAt: cat.fetchedAt, from: cat.from, perSource: Object.fromEntries(Object.entries(cat.perSource).map(([k, v]) => [k, { label: v.label || k, count: v.count, error: null }])), stale: cat.stale, error: cat.error, installed };
}

// Local finds and your own sources, merged the old way (they need their repos read), minus anything already listed.
async function ownSources(st, cacheDir, listed) {
  const cfg = { builtin: Object.fromEntries(BUILTIN.map((b) => [b.SOURCE.id, false])), localFinds: st.localFinds || [], custom: st.sources?.custom || [] };
  if (!cfg.localFinds.length && !cfg.custom.length) return [];
  try {
    const cat = await fetchCatalog({ cacheDir: path.join(cacheDir, "own-sources"), refresh: true, config: cfg });
    const pub = await fetchPublished({ file: plansFileFor(st), cacheDir }).catch(() => null);
    const games = cat.games.filter((g) => !g.owner || !listed.has(`${g.owner}/${g.repo}`.toLowerCase()));
    return attachFacts(expandMultiGame(games, pub), pub);
  } catch { return []; } // offline with nothing saved: the published list still shows
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".svg": "image/svg+xml" };
// Covers are kept at tile size: the cover site serves full posters (~0.5 MB each, 946 MB for the whole catalog), and
// every tile is sent to the window as text. A small or see-through picture stays as it is.
const COVER_WIDTH = 512;
export function shrinkCover(buf) {
  const img = nativeImage.createFromBuffer(buf);
  if (img.isEmpty() || (img.getSize().width <= COVER_WIDTH && buf.length < 200_000)) return null;
  const small = img.getSize().width > COVER_WIDTH ? img.resize({ width: COVER_WIDTH, quality: "good" }) : img;
  const bmp = small.toBitmap(); // BGRA: any see-through pixel keeps it a PNG
  for (let i = 3; i < bmp.length; i += 4) if (bmp[i] < 255) return { buf: small.toPNG(), ext: ".png" };
  return { buf: small.toJPEG(85), ext: ".jpg" };
}

// Save All Covers For Offline (Settings): every catalog cover onto this computer now, not only as each is first shown.
// Our own picked covers only - the slow GitHub-page fallback is left to Browse.
let coversRun = null;
ipcMain.handle("covers:saveAll", async (e) => {
  if (coversRun) return { running: true };
  const games = [...state.catalogGames], cacheDir = app.getPath("userData"), preferBoxart = !!loadSettings().preferBoxart;
  const run = coversRun = { cancelled: false }; let done = 0, missing = 0;
  const worker = async () => {
    while (games.length && !run.cancelled) {
      if (!(await iconFor(games.shift(), { cacheDir, preferBoxart, lookOnGitHub: false, shrink: shrinkCover }).catch(() => null))) missing++;
      if (++done % 20 === 0) e.sender.send("covers:progress", { done, total: done + games.length });
    }
  };
  try { await Promise.all(Array.from({ length: 6 }, worker)); } finally { coversRun = null; }
  return { done, missing, cancelled: run.cancelled, mb: Math.round(dirSize(path.join(cacheDir, "icons")) / 1e6) };
});
ipcMain.handle("covers:cancel", () => { if (coversRun) coversRun.cancelled = true; return true; });
ipcMain.handle("catalog:icon", async (_e, { id }) => {
  const game = state.catalogGames.find((g) => g.id === id);
  const file = game && (await iconFor(game, { cacheDir: app.getPath("userData"), preferBoxart: !!loadSettings().preferBoxart, shrink: shrinkCover }));
  if (!file) return null;
  return { path: file, dataUrl: `data:${MIME[path.extname(file).toLowerCase()] || "image/png"};base64,${fs.readFileSync(file).toString("base64")}` };
});
