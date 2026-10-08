// The game browser's catalog: every source fetched, merged by repository so the
// same project never shows twice, cached so the browser works offline.

import { canonGame, canonRepo } from "./renames.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readManifests } from "./installhtml.js";
import * as portsdr from "./sources/portsdr.js";
import * as alexbeav from "./sources/alexbeav.js";
import { makeSource as githubUserSource } from "./sources/github-user.js";
import { makeSource as listUrlSource } from "./sources/list-url.js";
import * as finds from "./sources/finds.js";
import { sourceKey } from "./sources/shared-sources.js";
import { enrichBoxart } from "./boxart.js";

export const BUILTIN = [portsdr, alexbeav, finds];
// Sources whose "icons" are screenshots, not icons: these show box art (when found) either way.
const SCREENSHOT_ICONS = new Set(["alexbeav"]);
// The picture a card shows: the project's own icon, or box art when the user prefers it (or the
// project has no real icon). Falls back to whichever one exists.
export const artUrl = (g, preferBoxart) => ((preferBoxart || g.iconIsScreenshot || !g.iconUrl) ? g.boxartUrl || g.iconUrl : g.iconUrl) || "";

// config: { builtin: { portsdr: true, alexbeav: true }, custom: [{ type, value, enabled }], shared: [{ type, value, label }], disabledShared: { [key]: true } }
export function activeSources(config = {}) {
  const out = BUILTIN.filter((s) => config.builtin?.[s.SOURCE.id] !== false).map((s) => (s === finds && config.findsFile ? finds.withFile(config.findsFile) : s));
  if (config.localFinds?.length) out.push(finds.localSource(config.localFinds));
  const seen = new Set();
  const make = (c) => (c.type === "list" ? listUrlSource(c.value) : githubUserSource(c.value.replace(/^https?:\/\/github\.com\//i, "").replace(/\/.*$/, "")));
  for (const c of config.shared || []) {                       // managed list, published by the admin
    const k = sourceKey(c);
    if (config.disabledShared?.[k] || seen.has(k)) continue;
    seen.add(k); out.push(make(c));
  }
  for (const c of config.custom || []) {                       // this copy's own additions
    const k = sourceKey(c);
    if (c.enabled === false || !c.value || seen.has(k)) continue;
    seen.add(k); out.push(make(c));
  }
  return out;
}

// Same repository from two sources -> one card. Keys with no repo (project:...) never collide across sources.
export function mergeSources(lists) {
  const byId = new Map();
  for (const list of lists) for (const raw of list) {
    const g = canonGame(raw); // moved owners collapse onto one entry
    const cur = byId.get(g.id);
    if (!cur) { byId.set(g.id, { ...g, sources: [g.source] }); continue; }
    // First source wins for the basics; fill anything it lacked from the later one.
    const merged = { ...cur, sources: [...cur.sources, g.source] };
    for (const [k, v] of Object.entries(g)) {
      if (k === "source" || k === "sources") continue;
      const empty = merged[k] === undefined || merged[k] === null || merged[k] === "" || merged[k] === "unknown" || (Array.isArray(merged[k]) && !merged[k].length);
      if (empty && v !== undefined && v !== null && v !== "") merged[k] = v;
    }
    merged.platforms = [...new Set([...(cur.platforms || []), ...(g.platforms || [])])];
    byId.set(g.id, merged);
  }
  return [...byId.values()];
}

// Fresh copy when the network allows, last good copy per source otherwise.
export async function fetchCatalog({ cacheDir, refresh = true, config = {} }) {
  const file = path.join(cacheDir, "catalog.json");
  const cached = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const sources = activeSources(config);
  const wanted = new Set(sources.map((s) => s.SOURCE.id));
  if (!refresh && cached && [...wanted].every((id) => cached.perSource?.[id])) {
    const games = mergeSources([...wanted].map((id) => cached.perSource[id].games || []));
    for (const g of games) g.firstSeen = cached.firstSeen?.[g.id] || null;
    return { ...cached, games, stale: false };
  }
  const perSource = {};
  const lists = [];
  let anyFresh = false;
  for (const src of sources) {
    try {
      const games = await src.fetchSource();
      await enrichBoxart(games, { cacheDir });
      if (SCREENSHOT_ICONS.has(src.SOURCE.id)) for (const g of games) g.iconIsScreenshot = true;
      perSource[src.SOURCE.id] = { label: src.SOURCE.label, url: src.SOURCE.url, fetchedAt: new Date().toISOString(), count: games.length, games };
      lists.push(games); anyFresh = true;
    } catch (err) {
      const old = cached?.perSource?.[src.SOURCE.id];
      perSource[src.SOURCE.id] = { ...(old || { count: 0, games: [] }), error: err.message };
      if (old?.games?.length) lists.push(old.games);
    }
  }
  const games = mergeSources(lists);
  if (!games.length) throw new Error(`Couldn't load the catalog: ${Object.values(perSource).map((s) => s.error).filter(Boolean).join("; ")}`);
  // When did we first see each project? Drives the "New This Week" shelf.
  const firstSeen = { ...(cached?.firstSeen || {}) };
  const now = new Date().toISOString();
  const brandNewCache = !cached; // first ever fetch: nothing is "new", it's all just the catalog
  for (const g of games) { if (!firstSeen[g.id]) firstSeen[g.id] = brandNewCache ? "1970-01-01T00:00:00.000Z" : now; g.firstSeen = firstSeen[g.id]; }
  const out = { fetchedAt: now, perSource, games, firstSeen };
  if (anyFresh) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(out)); }
  const errors = Object.entries(perSource).filter(([, s]) => s.error).map(([id, s]) => `${id}: ${s.error}`);
  return { ...out, stale: !anyFresh, error: errors.join("; ") || null };
}

const IMAGE_MAGIC = [[0x89, 0x50, 0x4e, 0x47], [0xff, 0xd8, 0xff], [0x47, 0x49, 0x46], [0x52, 0x49, 0x46, 0x46], [0x00, 0x00, 0x01, 0x00], [0x3c]]; // png jpg gif webp ico svg
const looksLikeImage = (buf) => IMAGE_MAGIC.some((m) => m.every((b, i) => buf[i] === b));

async function fetchImage(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    let buf = Buffer.from(await res.arrayBuffer());
    // libretro-thumbnails keeps some entries as git symlinks: raw returns the target filename as text.
    if (!looksLikeImage(buf) && buf.length < 300 && /\.(png|jpe?g)$/i.test(buf.toString())) {
      const sibling = new URL(encodeURIComponent(buf.toString().trim()), url).href;
      return fetchImage(sibling);
    }
    return looksLikeImage(buf) ? { buf, url } : null;
  } catch { return null; }
}

// GitHub's custom social-preview image for the repo, if it has one. Never the owner's profile photo: on a game
// tile that's a stranger's face, so a game with no art of its own gets a plain title card instead.
export async function githubArtCandidates(game) {
  if (!game.owner) return [];
  const out = [];
  try {
    const html = await (await fetch(`https://github.com/${game.owner}/${game.repo}`, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(20_000) })).text();
    const m = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (m && !/opengraph\.githubassets\.com/.test(m[1])) out.push(m[1]); // custom social preview only; the auto one is a text card
  } catch {}
  return out;
}

// Local path of the card's icon, downloaded once. Tries the catalog's URL, then GitHub fallbacks. null only if all fail.
export async function iconFor(game, { cacheDir, preferBoxart = false }) {
  const dir = path.join(cacheDir, "icons");
  // Icons saved before 8 Oct 2026 may be profile photos, and can't be told apart: start the cache over once.
  const marker = path.join(dir, ".no-profile-photos");
  if (fs.existsSync(dir) && !fs.existsSync(marker)) { fs.rmSync(dir, { recursive: true, force: true }); }
  if (!fs.existsSync(marker)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(marker, ""); }
  const keyFor = (u) => path.join(dir, crypto.createHash("sha1").update(u).digest("hex"));
  const first = artUrl(game, preferBoxart);
  const primaryKey = keyFor(first || game.id);
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.startsWith(path.basename(primaryKey)) && fs.statSync(path.join(dir, f)).size > 300) : null;
  if (existing) return path.join(dir, existing);
  const PROFILE_PHOTO = /avatars\.githubusercontent\.com|^https:\/\/github\.com\/[^/]+\.png/i; // a catalog's "icon" is sometimes the owner's photo
  const candidates = [...new Set([first, game.iconUrl, game.boxartUrl, ...(await githubArtCandidates(game))].filter((u) => u && !PROFILE_PHOTO.test(u)))];
  for (const url of candidates) {
    const got = await fetchImage(url);
    if (!got) continue;
    const ext = (path.extname(new URL(got.url).pathname).toLowerCase().match(/^\.(png|jpe?g|gif|webp|ico|svg)$/) || [".png"])[0];
    const file = primaryKey + ext;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, got.buf);
    return file;
  }
  return null;
}

// What's already set up in the output folder, keyed by lower-case owner/repo.
export function installedIndex(outDir) {
  const out = {};
  for (const m of readManifests(outDir)) {
    const key = canonRepo(String(m.repo || "")).toLowerCase();
    if (!key) continue;
    out[key] ||= [];
    out[key].push({ folder: m.folder, title: m.plan?.game_title, tag: m.release?.tag || null, setUpAt: m.setUpAt, status: m.status, target: m.target || "windows" });
  }
  return out;
}
