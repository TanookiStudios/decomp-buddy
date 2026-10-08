// Support This Project links, and the held-back list the catalog leaves out (decomps nobody can play yet).
import { ipcMain } from "electron";
import { fetchFunding } from "../funding.js";
import { WAITING_URL } from "../waiting.js";
import { diskCache, isNetworkError } from "./core.js";

const DAY = 86400e3;
const fundingCache = diskCache("funding"), waitingCache = diskCache("waiting");
const fresh = (hit, ms) => hit && Date.now() - Date.parse(hit.at) < ms;

ipcMain.handle("game:funding", async (_e, { owner, repo, host }) => {
  if (!owner || host === "gitlab") return { links: [] };
  const key = `${owner}/${repo}`;
  const hit = fundingCache.get(key); if (fresh(hit, 7 * DAY)) return hit.v;
  try { const v = await fetchFunding(owner, repo); fundingCache.set(key, v); return v; }
  catch (err) { if (hit && isNetworkError(err)) return hit.v; return { links: [] }; }
});

// waiting.json: decomps with nothing playable yet, kept out of the catalog. Refreshed every few hours,
// last copy kept for offline.
export async function getWaiting(force = false) {
  const hit = waitingCache.get("list");
  if (!force && fresh(hit, 6 * 3600e3)) return { ...hit.v, at: hit.at };
  try {
    const res = await fetch(WAITING_URL, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) throw new Error(`The list didn't load (HTTP ${res.status}).`);
    const v = await res.json(); waitingCache.set("list", v);
    return { ...v, at: new Date().toISOString() };
  } catch (err) {
    if (hit) return { ...hit.v, at: hit.at, stale: true };
    throw new Error(isNetworkError(err) ? "You're offline, and this list hasn't been downloaded yet." : err.message);
  }
}
