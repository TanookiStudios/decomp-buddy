// Box art from the libretro-thumbnails project (the RetroArch thumbnail packs on
// GitHub): one directory listing per console, cached, fuzzy-matched by title + region.

import fs from "node:fs";
import path from "node:path";

const API = "https://api.github.com/repos/libretro-thumbnails";
const RAW = "https://raw.githubusercontent.com/libretro-thumbnails";
const WEEK = 7 * 24 * 3600 * 1000;

// Catalog console name -> thumbnail repo
export const REPO_FOR_CONSOLE = {
  "PlayStation": "Sony_-_PlayStation", "PlayStation 2": "Sony_-_PlayStation_2", "PlayStation Portable": "Sony_-_PlayStation_Portable",
  "Nintendo 64": "Nintendo_-_Nintendo_64", "GameCube": "Nintendo_-_GameCube", "Nintendo GameCube": "Nintendo_-_GameCube", "Wii": "Nintendo_-_Wii", "Nintendo Wii": "Nintendo_-_Wii",
  "SNES": "Nintendo_-_Super_Nintendo_Entertainment_System", "NES": "Nintendo_-_Nintendo_Entertainment_System",
  "Game Boy": "Nintendo_-_Game_Boy", "Game Boy Color": "Nintendo_-_Game_Boy_Color", "Game Boy Advance": "Nintendo_-_Game_Boy_Advance",
  "Nintendo DS": "Nintendo_-_Nintendo_DS", "Nintendo 3DS": "Nintendo_-_Nintendo_3DS",
  "Xbox": "Microsoft_-_Xbox", "Xbox 360": "Microsoft_-_Xbox_360", "Mega Drive": "Sega_-_Mega_Drive_-_Genesis", "Dreamcast": "Sega_-_Dreamcast",
  "IBM PC (MS-DOS)": "DOS", "Arcade": ["FBNeo_-_Arcade_Games", "MAME"], "Saturn": "Sega_-_Saturn", "Master System": "Sega_-_Master_System_-_Mark_III",
  "Sega CD": "Sega_-_Mega-CD_-_Sega_CD", "Game Gear": "Sega_-_Game_Gear", "PlayStation 3": "Sony_-_PlayStation_3", "PlayStation 4": "Sony_-_PlayStation_4",
  "Wii U": "Nintendo_-_Wii_U", "Virtual Boy": "Nintendo_-_Virtual_Boy", "Amiga": "Commodore_-_Amiga", "Commodore 64": "Commodore_-_64",
};

export const norm = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const regionOf = (r) => (/usa|canada|america/i.test(r) ? "USA" : /europe|pal/i.test(r) ? "Europe" : /japan/i.test(r) ? "Japan" : null);

// Names in Named_Boxarts/ for one console, cached a week. null when GitHub says no.
export async function boxartNames(repo, { cacheDir }) {
  const file = path.join(cacheDir, "boxart", `${repo}.json`);
  try {
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Date.now() - c.at < WEEK) return c.names;
  } catch {}
  try {
    const h = { "User-Agent": "decomp-buddy" };
    const root = await (await fetch(`${API}/${repo}/git/trees/master`, { headers: h, signal: AbortSignal.timeout(30_000) })).json();
    const dir = root.tree?.find((e) => e.path === "Named_Boxarts");
    if (!dir) return null;
    const tree = await (await fetch(`${API}/${repo}/git/trees/${dir.sha}`, { headers: h, signal: AbortSignal.timeout(60_000) })).json();
    const names = (tree.tree || []).filter((e) => e.path.endsWith(".png")).map((e) => e.path.slice(0, -4));
    if (!names.length) return null;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ at: Date.now(), names }));
    return names;
  } catch { return null; }
}

// Best box-art filename for a title/region among the listing, or null.
// A catalog title without the project's own name: "Metal Slug 3 (Recomp)" -> "Metal Slug 3".
export const plainTitle = (title) => String(title).replace(/(\s*\([^()]*\))+\s*$/, "").replace(/\s+(recomp(iled)?|decomp(iled|ilation)?|pc port|native( pc)? port|port)$/i, "").trim() || String(title);
export function matchBoxart(names, title, region) {
  const t = norm(plainTitle(title));
  const variants = new Set([t]);
  const moved = (x) => { const m = x.match(/^(the|a|an) (.+)$/); return m ? `${m[2]} ${m[1]}` : null; };   // "Mummy, The"
  if (moved(t)) variants.add(moved(t));
  // Subtitles: "The Legend of Zelda: Ocarina of Time" is "Legend of Zelda, The - Ocarina of Time" in the packs.
  const parts = plainTitle(title).split(/\s*(?::| - )\s*/);
  if (parts.length > 1) { const main = norm(parts[0]), sub = norm(parts.slice(1).join(" ")); if (moved(main)) variants.add(`${moved(main)} ${sub}`); }
  variants.add(`${t} version`);                                                     // "Pokemon - FireRed Version"
  const reg = regionOf(region || "");
  const parsed = names.map((f) => { const mm = f.match(/^(.*?)\s*\((.*)$/); return { f, name: norm(mm ? mm[1] : f), rest: mm ? mm[2] : "" }; });
  const cands = parsed.filter((e) => variants.has(e.name));
  if (!cands.length) return null;
  // Same name, different years ("Fallout (1990)" and the 1997 "Fallout"): different games - no guessing.
  const years = new Set(cands.map((e) => (e.rest.match(/\b(19[7-9]\d|20[0-3]\d)\b/) || [""])[0]));
  if (years.size > 1) return null;
  const notLater = (e) => !/Disc [2-9]/.test(e.rest);
  return (reg && cands.find((e) => e.rest.includes(reg) && notLater(e))) || cands.find((e) => e.rest.includes("USA") && notLater(e)) || cands.find(notLater) || cands[0];
}

export const boxartUrl = (repo, name) => `${RAW}/${repo}/master/Named_Boxarts/${encodeURIComponent(name.f)}.png`;

// Find box art for every game that has none yet. Kept beside the author's own icon (boxartUrl);
// which one a card shows is the "Show Box Art" setting - see artUrl in catalog.js.
export async function enrichBoxart(games, { cacheDir, wants = (g) => !g.boxartUrl }) {
  const byRepo = new Map();
  for (const g of games) {
    if (!wants(g)) continue;
    for (const repo of [REPO_FOR_CONSOLE[g.console] || []].flat()) {      // Arcade has two packs
      if (!byRepo.has(repo)) byRepo.set(repo, await boxartNames(repo, { cacheDir }));
      const names = byRepo.get(repo);
      const hit = names && matchBoxart(names, g.title, g.region);
      if (hit) { g.boxartUrl = boxartUrl(repo, hit); break; }
    }
  }
  return games;
}
