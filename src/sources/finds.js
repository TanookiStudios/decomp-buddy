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
const PLATFORM_OF_ASSET = [[/win(dows|64|32)?[-_.]|\.exe$|\.msi$|-win\b|^(?!.*(linux|mac|osx|darwin|android|\.apk)).*[-_.]pc[-_.]/i, "Windows"], [/mac(os)?|darwin|\.dmg$|\.pkg$/i, "macOS"], [/linux|\.appimage$|\.deb$|\.tar\.zst$/i, "Linux"], [/^(?!.*(quest|oculus|openxr|(^|[^a-z])vr([^a-z]|$))).*(android.*|\.apk)$/i, "Android"], [/^(?=.*(quest|oculus|openxr|(^|[^a-z])vr([^a-z]|$))).*\.apk$/i, "Meta Quest"]]; // a Quest .apk isn't a phone app

// One repo's facts, from either API: meta = { full_name, description, homepage, pushed_at, topics,
// stargazers_count, fork }, live = non-draft releases newest first, each { tag_name, prerelease, published_at, assets: [{ name }] }.
// A release its author labels as not a release ("NOT A RELEASE: test file for issue #12 only") isn't a download.
const NOT_A_RELEASE = /not[\s_-]*a[\s_-]*release|test[\s_-]*(file|build)?[\s_-]*only/i;
function infoFrom(key, meta, releases) {
  const live = releases.filter((r) => !NOT_A_RELEASE.test(`${r.name || ""} ${r.tag_name} ${(r.assets || []).map((a) => a.name).join(" ")}`));
  const platforms = new Set();
  for (const r of live) for (const a of r.assets || []) for (const [re, p] of PLATFORM_OF_ASSET) if (re.test(a.name)) platforms.add(p);
  const text = `${meta.name || ""} ${meta.description || ""} ${(meta.topics || []).join(" ")}`;
  const consoleGuess = (CONSOLE_HINTS.find(([re]) => re.test(text)) || [])[1] || "";
  return {
    repo: meta.full_name || key, notes: meta.description || "", website: meta.homepage || "",
    platforms: [...platforms], version: live[0]?.tag_name || null, status: live[0] ? (live[0].prerelease ? "prerelease" : "latest") : "none",
    updatedAt: live[0]?.published_at || meta.pushed_at || "", consoleGuess, exists: !!meta.full_name,
    stars: meta.stargazers_count || 0, fork: !!meta.fork, releases: live.slice(0, 3).map((r) => ({ tag: r.tag_name, files: (r.assets || []).map((a) => a.name).slice(0, 12) })),
  };
}

// Everything GitHub will tell us about a repo without the AI: description, homepage, latest tag,
// which platforms the release assets cover, last push, and a console guess from the text.
export async function enrichFromGitHub(key) {
  const h = { "User-Agent": "decomp-buddy", Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const metaRes = await fetch(`https://api.github.com/repos/${key}`, { headers: h, signal: AbortSignal.timeout(20_000) });
  // A rate limit is not "this repo doesn't exist" - say which one it is.
  if (metaRes.status === 403 || metaRes.status === 429) throw new Error("GitHub rate limit hit. Wait an hour or set GITHUB_TOKEN.");
  const meta = await metaRes.json().catch(() => ({}));
  const releases = await (await fetch(`https://api.github.com/repos/${key}/releases?per_page=30`, { headers: h, signal: AbortSignal.timeout(20_000) })).json().catch(() => []);
  return infoFrom(key, meta, Array.isArray(releases) ? releases.filter((r) => !r.draft) : []);
}

// The same facts for a GitLab project, from GitLab's public API (no key needed for public projects).
export async function enrichFromGitLab(key) {
  const api = `https://gitlab.com/api/v4/projects/${encodeURIComponent(key)}`, h = { "User-Agent": "decomp-buddy" };
  const get = async (u) => { const r = await fetch(u, { headers: h, signal: AbortSignal.timeout(20_000) }); if (r.status === 429) throw new Error("GitLab rate limit hit."); return r.ok ? r.json() : null; };
  const meta = await get(api);
  if (!meta) return infoFrom(key, {}, []);
  const rel = (await get(`${api}/releases?per_page=30`)) || [];
  return infoFrom(key, { full_name: meta.path_with_namespace, name: meta.path, description: meta.description, homepage: "", pushed_at: meta.last_activity_at, topics: meta.topics || [], stargazers_count: meta.star_count, fork: !!meta.forked_from_project },
    rel.filter((r) => !r.upcoming_release).map((r) => ({ name: r.name, tag_name: r.tag_name, prerelease: false, published_at: r.released_at, assets: (r.assets?.links || []).map((l) => ({ name: l.name })) })));
}
// And for a Codeberg repo, from its Forgejo API (Forgejo answers in GitHub's shape, mostly).
export async function enrichFromCodeberg(key) {
  const api = `https://codeberg.org/api/v1/repos/${key}`, h = { "User-Agent": "decomp-buddy", Accept: "application/json" };
  const get = async (u) => { const r = await fetch(u, { headers: h, signal: AbortSignal.timeout(20_000) }); if (r.status === 429) throw new Error("Codeberg rate limit hit."); return r.ok ? r.json() : null; };
  const meta = await get(api);
  if (!meta) return infoFrom(key, {}, []);
  const rel = (await get(`${api}/releases?limit=30`)) || [];
  return infoFrom(key, { full_name: meta.full_name, name: meta.name, description: meta.description, homepage: meta.website || "", pushed_at: meta.updated_at, topics: meta.topics || [], stargazers_count: meta.stars_count, fork: !!meta.fork },
    rel.filter((r) => !r.draft).map((r) => ({ name: r.name, tag_name: r.tag_name, prerelease: !!r.prerelease, published_at: r.published_at, assets: (r.assets || []).map((a) => ({ name: a.name })) })));
}

// The same facts for many repos at once: GraphQL answers ~40 repos per request from its own hourly
// allowance, where REST spends 2 requests per repo. Returns Map(key -> info, or the Error for its batch).
// Without a token (GraphQL needs one) it falls back to one REST lookup at a time.
const REPO_FIELDS = `nameWithOwner description homepageUrl pushedAt stargazerCount isFork
  repositoryTopics(first: 10) { nodes { topic { name } } }
  releases(first: 30, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { name tagName isPrerelease isDraft publishedAt releaseAssets(first: 50) { nodes { name } } } }`;
export async function enrichMany(keys, { size = 40, post = graphql } = {}) {
  const out = new Map();
  if (!process.env.GITHUB_TOKEN) { for (const k of keys) out.set(k, await enrichFromGitHub(k).catch((err) => err)); return out; }
  for (let i = 0; i < keys.length; i += size) {
    const batch = keys.slice(i, i + size);
    const query = `query {\n${batch.map((k, j) => { const [o, n] = k.split("/"); return `r${j}: repository(owner: ${JSON.stringify(o)}, name: ${JSON.stringify(n || "")}) { ${REPO_FIELDS} }`; }).join("\n")}\n}`;
    let data;
    try { data = await post(query); }
    catch (err) { for (const k of batch) out.set(k, err); continue; }
    batch.forEach((k, j) => {
      const r = data?.[`r${j}`];
      if (!r) { out.set(k, infoFrom(k, {}, [])); return; } // not found (deleted, private, or a typo)
      const meta = { full_name: r.nameWithOwner, name: r.nameWithOwner.split("/")[1], description: r.description, homepage: r.homepageUrl, pushed_at: r.pushedAt,
        topics: r.repositoryTopics.nodes.map((t) => t.topic.name), stargazers_count: r.stargazerCount, fork: r.isFork };
      const live = r.releases.nodes.filter((x) => !x.isDraft).map((x) => ({ name: x.name, tag_name: x.tagName, prerelease: x.isPrerelease, published_at: x.publishedAt, assets: x.releaseAssets.nodes }));
      out.set(k, infoFrom(k, meta, live));
    });
  }
  return out;
}

async function graphql(query) {
  const res = await fetch("https://api.github.com/graphql", { method: "POST", headers: { "User-Agent": "decomp-buddy", Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(60_000) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 403 || res.status === 429 || body.errors?.some((e) => e.type === "RATE_LIMITED")) throw new Error("GitHub rate limit hit. Wait an hour or set GITHUB_TOKEN.");
  if (!res.ok) throw new Error(`GitHub GraphQL answered HTTP ${res.status}`);
  // A missing repo comes back as null plus a NOT_FOUND error; anything else wrong is the whole batch's problem.
  const fatal = (body.errors || []).filter((e) => e.type !== "NOT_FOUND");
  if (!body.data || fatal.length) throw new Error(`GitHub GraphQL: ${(fatal[0] || {}).message || "no data"}`);
  return body.data;
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
