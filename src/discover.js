// Finding projects nobody has listed yet: Reddit (RSS - Reddit's JSON needs OAuth, the feed
// doesn't) and GitHub search. Both return raw candidates; the admin decides what's real.

const UA = "decomp-buddy/discover (by /u/tanookistudios)";
const REPO_RE = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?=[\/#?"'<>\s),\]]|$)/g;
const NOT_REPOS = /^(sponsors|orgs|topics|features|about|settings|marketplace|explore|search|login|apps)$/i;
const unescape = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

export function reposIn(text) {
  const out = new Map();
  for (const m of String(text).matchAll(REPO_RE)) { if (NOT_REPOS.test(m[1])) continue; out.set(`${m[1]}/${m[2]}`.toLowerCase(), `${m[1]}/${m[2]}`); }
  return out;
}

export function parseRedditRss(xml, sub) {
  const out = [], unlinked = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const title = unescape((entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
    const link = (entry.match(/<link href="([^"]+)"/) || [])[1] || "";
    const updated = (entry.match(/<updated>([^<]+)<\/updated>/) || [])[1] || "";
    const content = unescape((entry.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "");
    const repos = reposIn(`${content} ${link}`);
    for (const [, repo] of repos) out.push({ repo, title, via: `r/${sub}`, url: link, seen: updated });
    // A post about a port with no GitHub link in it (a video, a screenshot): the title is still a lead.
    if (!repos.size && /recomp|decomp|port|native|remaster|\bpc\b/i.test(title)) unlinked.push({ title, url: link, sub, seen: updated });
  }
  out.unlinked = unlinked;
  return out;
}

export const REDDIT_SUBS = ["decomps", "recomps", "emulation", "decompilation"];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// One bad subreddit doesn't sink the others; errors come back alongside. Reddit answers 429 when feeds
// are asked for back to back, so subreddits go a few seconds apart and a 429 gets one slower retry.
export async function scanReddit(subs = REDDIT_SUBS, { gap = 10000, retryAfter = 45000 } = {}) {
  const out = [], errors = [], unlinked = [];
  for (const [i, sub] of subs.entries()) {
    if (i) await pause(gap);
    try {
      const get = () => fetch(`https://www.reddit.com/r/${sub}/new.rss?limit=100`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
      let res = await get();
      if (res.status === 429) { await pause(retryAfter); res = await get(); }
      if (!res.ok) { errors.push(`r/${sub} answered ${res.status}`); continue; }
      const got = parseRedditRss(await res.text(), sub);
      out.push(...got); unlinked.push(...got.unlinked);
    } catch (err) { errors.push(`r/${sub}: ${err.message}`); }
  }
  out.errors = errors; out.unlinked = unlinked;
  return out;
}

const JUNK = /recompra|dashboard|wordpress|npm|react|angular|laravel|docker|kubernetes|terraform|tutorial|course|homework|assignment|bootcamp|whatsapp|\bapk\b|mod-index|mod index/i;
const QUERIES = ['recomp in:name', 'recompiled in:name,description', 'decomp in:name', '"pc port" in:name,description', 'recompilation in:description', 'decompilation game in:description'];

export async function scanGitHub({ queries = QUERIES, log = () => {} } = {}) {
  const out = new Map();
  for (const q of queries) {
    const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=50`, { headers: { "User-Agent": UA, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30_000) });
    if (res.status === 403 || res.status === 429) { log("GitHub search rate limit hit - partial results"); break; }
    if (!res.ok) { log(`GitHub search "${q}" answered ${res.status}`); continue; }
    for (const r of (await res.json()).items || []) {
      if (r.fork || r.archived || JUNK.test(`${r.name} ${r.description || ""}`)) continue;
      if (!/recomp|decomp|port|native/i.test(`${r.name} ${r.description || ""}`)) continue;
      out.set(r.full_name.toLowerCase(), { repo: r.full_name, title: r.description || r.name, via: "GitHub search", url: r.html_url, seen: r.pushed_at, stars: r.stargazers_count });
    }
  }
  return [...out.values()];
}

// ---- Bluesky: public search, no key. api.bsky.app (the "public." host refuses non-browser clients).
export async function scanBluesky(terms = ["recomp", "decompilation", '"pc port"']) {
  const out = [];
  for (const q of terms) {
    const res = await fetch(`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&sort=latest&limit=100`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) { out.errors = [...(out.errors || []), `search "${q}" answered ${res.status}`]; continue; }
    for (const p of (await res.json()).posts || []) {
      const text = p.record?.text || "";
      const links = (p.record?.facets || []).flatMap((f) => (f.features || []).map((x) => x.uri || "")).join(" ");
      const embed = p.record?.embed?.external?.uri || "";
      for (const [, repo] of reposIn(`${text} ${links} ${embed}`)) out.push({ repo, title: text.slice(0, 120).replace(/\s+/g, " "), via: "Bluesky", url: `https://bsky.app/profile/${p.author?.handle}/post/${(p.uri || "").split("/").pop()}`, seen: p.indexedAt || "" });
    }
  }
  return out;
}

// ---- YouTube: a channel's RSS feed (works for most channels; some 404 and are reported).
export async function youtubeChannelId(handleOrId) {
  const h = String(handleOrId).trim();
  if (/^UC[\w-]{20,}$/.test(h)) return h;
  const url = /^https?:/.test(h) ? h : `https://www.youtube.com/${h.startsWith("@") ? h : "@" + h}`;
  const html = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) })).text();
  const m = html.match(/"externalId":"(UC[\w-]+)"/) || html.match(/"channelId":"(UC[\w-]+)"/);
  if (!m) throw new Error(`Couldn't find a channel id for ${h}`);
  return m[1];
}
export async function scanYouTube(channels, { resolve = youtubeChannelId } = {}) {
  const out = [], errors = [];
  for (const ch of channels) {
    try {
      const id = await resolve(ch);
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) { errors.push(`${ch}: feed answered ${res.status}`); continue; }
      const xml = await res.text();
      for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
        const title = unescape((entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
        const link = (entry.match(/<link rel="alternate" href="([^"]+)"/) || [])[1] || "";
        const desc = unescape((entry.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || "");
        const when = (entry.match(/<published>([^<]+)<\/published>/) || [])[1] || "";
        for (const [, repo] of reposIn(desc)) out.push({ repo, title, via: `YouTube ${ch}`, url: link, seen: when });
      }
    } catch (err) { errors.push(`${ch}: ${err.message}`); }
  }
  return { candidates: out, errors };
}

// ---- GitHub topics: people who tag their repo are usually shipping something.
export async function scanGitHubTopics({ topics = ["recompilation", "decompilation", "n64recomp", "static-recompilation", "pc-port"], log = () => {} } = {}) {
  return scanGitHub({ queries: topics.map((t) => `topic:${t}`), log });
}
