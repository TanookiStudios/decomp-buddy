// Source: Individual Finds - a JSON feed of individual repos she found that no catalog
// lists yet. Published on tanookistudios.com; a copy is bundled with each release as
// the offline fallback. Every user also keeps a local list of their own added games.
//
// finds.json: { "updatedAt": iso, "games": [{ "repo": "owner/name", "title", "console", "platforms": [], "iconUrl", "notes", "addedAt" }] }

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FINDS_URL = "https://tanookistudios.com/decomp-buddy/finds.json";
export const SOURCE = { id: "finds", label: "Individual Finds", url: FINDS_URL };
const BUNDLED = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "finds.json");

export function repoKey(input) {
  const m = String(input || "").trim().match(/(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[\/#?].*)?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function findsToGames(picks, sourceId = SOURCE.id) {
  return (picks?.games || []).map((p) => {
    const key = repoKey(p.repo); if (!key) return null;
    const [owner, repo] = key.split("/");
    return {
      source: sourceId, id: `github:${key}`.toLowerCase(),
      title: p.title || repo.replace(/[-_]+/g, " "), project: repo, console: p.console || "Unknown",
      platforms: Array.isArray(p.platforms) ? p.platforms : [], repoUrl: `https://github.com/${key}`, repoHost: "github", owner, repo,
      version: p.version || null, releaseUrl: p.version ? `https://github.com/${key}/releases/tag/${p.version}` : `https://github.com/${key}/releases`, status: p.status || "unknown", updatedAt: p.updatedAt || p.addedAt || "",
      iconUrl: p.iconUrl || "", website: p.website || "", aiAssisted: false, description: p.notes || "", region: p.region || "", addedAt: p.addedAt || "",
    };
  }).filter(Boolean);
}

const CONSOLE_HINTS = [
  [/xbox ?360|xenon/i, "Xbox 360"], [/playstation ?2|\bps2\b/i, "PlayStation 2"], [/playstation ?portable|\bpsp\b/i, "PlayStation Portable"],
  [/playstation|\bps1\b|\bpsx\b/i, "PlayStation"], [/nintendo ?64|\bn64\b/i, "Nintendo 64"], [/gamecube|\bgcn?\b/i, "GameCube"], [/\bwii u\b/i, "Wii U"], [/\bwii\b/i, "Wii"],
  [/game ?boy ?advance|\bgba\b/i, "Game Boy Advance"], [/game ?boy ?color|\bgbc\b/i, "Game Boy Color"], [/game ?boy|\bgb\b/i, "Game Boy"], [/nintendo ?ds|\bnds\b/i, "Nintendo DS"],
  [/\bsnes\b|super nintendo/i, "SNES"], [/\bnes\b|famicom/i, "NES"], [/dreamcast/i, "Dreamcast"], [/mega ?drive|genesis/i, "Mega Drive"], [/\bxbox\b/i, "Xbox"],
];
const PLATFORM_OF_ASSET = [[/win(dows|64|32)?[-_.]|\.exe$|\.msi$|-win\b/i, "Windows"], [/mac(os)?|darwin|\.dmg$|\.pkg$/i, "macOS"], [/linux|\.appimage$|\.deb$|\.tar\.zst$/i, "Linux"], [/android|\.apk$/i, "Android"]];

// Everything GitHub will tell us about a repo without the AI: description, homepage, latest tag,
// which platforms the release assets cover, last push, and a console guess from the text.
export async function enrichFromGitHub(key) {
  const h = { "User-Agent": "decomp-buddy", Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const metaRes = await fetch(`https://api.github.com/repos/${key}`, { headers: h, signal: AbortSignal.timeout(20_000) });
  // A rate limit is not "this repo doesn't exist" - say which one it is.
  if (metaRes.status === 403 || metaRes.status === 429) throw new Error("GitHub rate limit hit. Wait an hour or set GITHUB_TOKEN.");
  const meta = await metaRes.json().catch(() => ({}));
  const releases = await (await fetch(`https://api.github.com/repos/${key}/releases?per_page=30`, { headers: h, signal: AbortSignal.timeout(20_000) })).json().catch(() => []);
  const live = Array.isArray(releases) ? releases.filter((r) => !r.draft) : [];
  const platforms = new Set();
  for (const r of live) for (const a of r.assets || []) for (const [re, p] of PLATFORM_OF_ASSET) if (re.test(a.name)) platforms.add(p);
  const text = `${meta.name || ""} ${meta.description || ""} ${(meta.topics || []).join(" ")}`;
  const consoleGuess = (CONSOLE_HINTS.find(([re]) => re.test(text)) || [])[1] || "";
  return {
    repo: meta.full_name || key, notes: meta.description || "", website: meta.homepage || "",
    platforms: [...platforms], version: live[0]?.tag_name || null, status: live[0] ? (live[0].prerelease ? "prerelease" : "latest") : "none",
    updatedAt: live[0]?.published_at || meta.pushed_at || "", consoleGuess, exists: !!meta.full_name,
  };
}

export function readBundled() {
  try { return JSON.parse(fs.readFileSync(BUNDLED, "utf8")); } catch { return { games: [] }; }
}

// Order: the admin's published file on disk (newest truth), the live feed, the bundled copy.
export async function fetchSource({ file } = {}) {
  if (file) { try { return findsToGames(JSON.parse(fs.readFileSync(file, "utf8"))); } catch {} }
  try {
    const res = await fetch(FINDS_URL, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (res.ok) return findsToGames(await res.json());
  } catch {}
  return findsToGames(readBundled());
}
export const withFile = (file) => ({ SOURCE, fetchSource: () => fetchSource({ file }) });

// The user's own additions, kept in settings; for Maddie these are what Publish exports.
export function localSource(list) {
  return { SOURCE: { id: "local-finds", label: "Added By You", url: "" }, async fetchSource() { return findsToGames({ games: list || [] }, "local-finds"); } };
}

// Merge the local list into a finds.json (existing file kept, deduped by repo, newest data wins), write it.
export function publishFinds(file, localList) {
  let existing = { games: [] };
  try { existing = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  const byKey = new Map();
  for (const g of [...(existing.games || []), ...(localList || [])]) { const k = repoKey(g.repo); if (!k) continue; const lk = k.toLowerCase(); const prev = byKey.get(lk); byKey.set(lk, { ...(prev || {}), ...g, repo: prev?.repo || k }); }
  const out = { updatedAt: new Date().toISOString(), games: [...byKey.values()].sort((a, b) => (a.title || a.repo).localeCompare(b.title || b.repo)) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  return out;
}
