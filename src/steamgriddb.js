// Covers from SteamGridDB for games the libretro packs don't have (mostly PC and Xbox 360 ports). Runs only when the
// public catalog is built on Maddie's Mac with her key (Keychain "steamgriddb"); the app never calls it or needs a key.
// Strict matching: the one game whose name equals the port's plain title, or nothing - a missing cover beats a wrong one.
import fs from "node:fs";
import path from "node:path";
import { norm, plainTitle } from "./boxart.js";

const API = "https://www.steamgriddb.com/api/v2";
const WEEK = 7 * 24 * 3600 * 1000;
const bare = (s) => norm(s).replace(/^the /, "");

// The SteamGridDB game id for a title, or null when there's no single exact match.
export function pickGame(results, title) {
  const want = bare(plainTitle(title));
  const same = (results || []).filter((r) => bare(r.name) === want);
  return same.length === 1 ? same[0].id : null;   // two same-name games (remakes, reboots): can't tell which
}

export async function enrichSteamGrid(games, { cacheDir, key, fetch = globalThis.fetch, log = () => {}, wants = (g) => !g.boxartUrl }) {
  const file = path.join(cacheDir, "steamgriddb.json");
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const get = async (p) => {
    const r = await fetch(`${API}${p}`, { headers: { Authorization: `Bearer ${key}` } });
    if (r.status === 401 || r.status === 403) throw new Error("SteamGridDB refused the key - check the Keychain item 'steamgriddb'");
    if (r.status === 404) return [];
    if (!r.ok) throw new Error(`SteamGridDB answered ${r.status}`);
    return (await r.json()).data || [];
  };
  let found = 0, asked = 0;
  try {
    for (const g of games) {
      if (!wants(g)) continue;
      const k = bare(plainTitle(g.title)); if (!k) continue;
      const hit = cache[k];
      if (hit && (hit.url || Date.now() - hit.at < WEEK)) { if (hit.url) { g.boxartUrl = hit.url; found++; } continue; }
      asked++;
      const id = pickGame(await get(`/search/autocomplete/${encodeURIComponent(plainTitle(g.title))}`), g.title);
      const grids = id ? await get(`/grids/game/${id}?dimensions=600x900&types=static&nsfw=false&humor=false`) : [];
      cache[k] = { url: grids[0]?.url || null, at: Date.now() };
      if (cache[k].url) { g.boxartUrl = cache[k].url; found++; }
    }
  } finally {
    fs.writeFileSync(file, JSON.stringify(cache));   // keep what was learned even if a later lookup failed
  }
  log(`steamgriddb: ${found} cover(s) (${asked} looked up)`);
  return games;
}
