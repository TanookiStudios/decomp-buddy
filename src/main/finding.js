// Support This Project links, and the held-back list the catalog leaves out (decomps nobody can play yet).
import { ipcMain } from "electron";
import { fetchFunding } from "../funding.js";
import { WAITING_URL } from "../waiting.js";
import { diskCache, isNetworkError, state } from "./core.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const BUNDLED_WAITING = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "waiting.json");

const DAY = 86400e3;
const fundingCache = diskCache("funding"), waitingCache = diskCache("waiting");
const fresh = (hit, ms) => hit && Date.now() - Date.parse(hit.at) < ms;

ipcMain.handle("game:funding", async (_e, { owner, repo, host }) => {
  if (!owner || (host && host !== "github")) return { links: [] }; // FUNDING.yml lookups are GitHub's
  const key = `${owner}/${repo}`;
  const hit = fundingCache.get(key); if (fresh(hit, 7 * DAY)) return hit.v;
  try { const v = await fetchFunding(owner, repo); fundingCache.set(key, v); return v; }
  catch (err) { if (hit && isNetworkError(err)) return hit.v; return { links: [] }; }
});

// waiting.json: decomps with nothing playable yet, kept out of the catalog. Refreshed every few hours,
// last copy kept for offline.
export async function getWaiting(force = false) {
  const hit = waitingCache.get("list");
  // A copy on disk shows at once; an old one is refreshed in the background, never waited on.
  if (hit && !force) { if (!fresh(hit, 6 * 3600e3)) refreshWaiting().catch(() => {}); return { ...hit.v, at: hit.at }; }
  // Never downloaded here: the copy built into the app at once, the website's in the background.
  const shipped = !hit && !force && bundledWaiting();
  if (shipped) { refreshWaiting().catch(() => {}); return shipped; }
  try { return await refreshWaiting(); }
  catch (err) {
    if (hit) return { ...hit.v, at: hit.at, stale: true };
    const v = bundledWaiting(); if (v) return { ...v, stale: true };
    throw new Error(isNetworkError(err) ? "You're offline, and this list hasn't been downloaded yet." : err.message);
  }
}
function bundledWaiting() { try { const v = JSON.parse(fs.readFileSync(BUNDLED_WAITING, "utf8")); return v.games?.length ? { ...v, at: v.updatedAt || null, from: "built-in" } : null; } catch { return null; } }
async function refreshWaiting() {
  const res = await fetch(WAITING_URL, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) throw new Error(`The list didn't load (HTTP ${res.status}).`);
  const v = await res.json(); waitingCache.set("list", v);
  return { ...v, at: new Date().toISOString() };
}
ipcMain.handle("waiting:list", async (_e, { fresh: force } = {}) => {
  const w = await getWaiting(force);
  // The two lists can be saved on different days: a game Browse already has isn't "coming soon" any more.
  const listed = new Set(state.catalogGames.filter((g) => g.owner).map((g) => `${g.owner}/${g.repo}`.toLowerCase()));
  return { games: (w.games || []).filter((g) => !listed.has(String(g.repo || "").toLowerCase())), at: w.at, stale: !!w.stale, from: w.from || null };
});

// Trending This Week: the games players who share counts set up most in the last 7 days (ranking only, at least 3
// set-ups each - the site decides). Asked at most every 6 hours; offline or empty just means no shelf.
const trendingCache = diskCache("trending"), BASE = () => (process.env.DECOMP_SUGGEST_BASE || "https://tanookistudios.com").replace(/\/$/, "");
ipcMain.handle("trending:get", async () => {
  const hit = trendingCache.get("week"); if (fresh(hit, 6 * 3600e3)) return hit.v;
  try {
    const r = await fetch(`${BASE()}/api/decomp-setups?days=7`, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(15_000) });
    const ids = r.ok ? (await r.json()).games || [] : [];
    trendingCache.set("week", ids);
    return ids;
  } catch { return hit?.v || []; }
});
