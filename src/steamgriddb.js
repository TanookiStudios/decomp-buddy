// Covers from SteamGridDB for games the libretro packs don't have (mostly PC and Xbox 360 ports). Runs only when the
// public catalog is built on Maddie's Mac with her key (Keychain "steamgriddb"); the app never calls it or needs a key.
// Strict matching: the one game whose name equals the port's plain title, or nothing - a missing cover beats a wrong one.
import fs from "node:fs";
import path from "node:path";
import { norm, plainTitle } from "./boxart.js";

const API = "https://www.steamgriddb.com/api/v2";
const WEEK = 7 * 24 * 3600 * 1000;
const ROMAN = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9" };
export const bareTitle = (s) => norm(s).replace(/^the /, "").split(" ").map((w) => ROMAN[w] || w).join(" ");
const bare = bareTitle;
// Consoles from before remakes muddied the names: of two same-name games, the oldest is the one the port came from.
const MODERN = /^PC\b|Windows|PlayStation [45]|Xbox One|Series|Switch|Unknown|Others/i;   // "IBM PC (MS-DOS)" is classic

// The SteamGridDB game id for a title, or null when there's no single match. "Fable II" matches "Fable 2", and
// "CTR (Crash Team Racing)" matches by its bracketed name. Same-name games are told apart only by age, and only for
// classic consoles (Shadow of the Colossus 2005, not the 2018 remake); otherwise a missing cover beats a wrong one.
export function pickGame(results, title, system = "") {
  const want = bare(plainTitle(title)), literal = norm(plainTitle(title)).replace(/^the /, "");
  const names = (r) => [r.name, r.name.replace(/\s*\([^()]*\)\s*$/, ""), r.name.match(/\(([^()]+)\)\s*$/)?.[1]].filter(Boolean);
  const same = (results || []).filter((r) => names(r).map(bare).includes(want));
  if (same.length === 1) return same[0].id;
  // "Mega Man V" (Game Boy) and "Mega Man 5" (NES) are different games: the name as written wins first.
  const written = same.filter((r) => names(r).some((n) => norm(n).replace(/^the /, "") === literal));
  if (written.length === 1) return written[0].id;
  const dated = same.filter((r) => r.release_date).sort((a, b) => a.release_date - b.release_date);
  if (same.length > 1 && system && !MODERN.test(system) && dated.length === same.length && dated[0].release_date < dated[1].release_date) return dated[0].id;
  return null;
}

// picks: { "<bare title>": steamGridDbId | null } chosen by hand (or by an agent from the cached candidates) for titles
// pickGame can't settle; null means "no cover is right", and stops further lookups.
export async function enrichSteamGrid(games, { cacheDir, key, fetch = globalThis.fetch, log = () => {}, wants = (g) => !g.boxartUrl, picks = {} }) {
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
      const pick = picks[k];
      const hit = cache[k];
      // v2 entries carry the candidates and the newer matcher; an older "no cover" answer is asked again.
      if (hit && hit.v === 2 && (pick === undefined || hit.pick === pick) && (hit.url || Date.now() - hit.at < WEEK)) { if (hit.url) { g.boxartUrl = hit.url; found++; } continue; }
      if (pick === null) { cache[k] = { ...hit, v: 2, url: null, pick, at: Date.now() }; continue; }   // keeps its candidates for a later look
      asked++;
      const results = pick ? [] : await get(`/search/autocomplete/${encodeURIComponent(plainTitle(g.title))}`);
      const id = pick || pickGame(results, g.title, g.console);
      const grids = id ? await get(`/grids/game/${id}?dimensions=600x900,342x482,660x930&types=static&nsfw=false&humor=false`) : [];
      cache[k] = { v: 2, url: grids[0]?.url || null, at: Date.now(), ...(pick !== undefined ? { pick } : {}),
        cands: results.slice(0, 8).map((r) => ({ id: r.id, name: r.name, year: r.release_date ? new Date(r.release_date * 1000).getUTCFullYear() : null })) };
      if (cache[k].url) { g.boxartUrl = cache[k].url; found++; }
    }
  } finally {
    fs.writeFileSync(file, JSON.stringify(cache));   // keep what was learned even if a later lookup failed
  }
  log(`steamgriddb: ${found} cover(s) (${asked} looked up)`);
  return games;
}
