// Source: a URL that lists game projects - a gist, a README, a plain .txt, a JSON catalog, or a web
// page. Plain text/HTML: every github.com / gitlab.com owner/repo link is a card. JSON: each entry
// that names a game and points at a repository becomes a card with its own title, console,
// platforms, icon and version. A page that draws its list with JavaScript (no links in the HTML)
// is followed to the JSON file its script loads - same site only.

const MAX_BYTES = 12 * 1024 * 1024;
const PLATFORMS = new Set(["Windows", "macOS", "Linux"]);
// Console names as portsdr spells them, so the same console groups together in Browse.
const CONSOLE = [[/^playstation\s*1$|^ps1$|^psx$/i, "PlayStation"], [/^super nintendo$|^snes$/i, "SNES"], [/^(pc|pc \/ other|others?|multiple)$/i, "Others"],
  [/^game ?cube \/ wii$/i, "GameCube"], [/^game boy \/ game boy color$/i, "Game Boy Color"], [/^sega \/ sonic$|^genesis$/i, "Mega Drive"], [/^ps2$/i, "PlayStation 2"], [/^psp$/i, "PlayStation Portable"]];
const consoleName = (c) => { const s = String(c || "").trim(); if (!s) return "Unknown"; const hit = CONSOLE.find(([re]) => re.test(s)); return hit ? hit[1] : s; };
const BAD_OWNER = /^(sponsors|orgs|topics|features|about|settings|marketplace|explore|search|login|signup|site|apps|collections)$/i;

// github.com/owner/repo, gitlab.com/owner/repo, or a bare "owner/repo" (only where a field says it's a repo)
function repoRef(v, { bare = false } = {}) {
  const s = String(v || "").trim();
  let m = s.match(/^https?:\/\/(?:www\.)?(github|gitlab)\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/i);
  if (!m && bare) { const b = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/); if (b) m = [s, "github", b[1], b[2]]; }
  if (!m || BAD_OWNER.test(m[2])) return null;
  return { host: m[1].toLowerCase(), owner: m[2], repo: m[3] };
}

function card(id, ref, extra = {}) {
  const { host, owner, repo } = ref; const base = `https://${host}.com/${owner}/${repo}`;
  return {
    source: id, id: `${host}:${owner}/${repo}`.toLowerCase(), title: repo.replace(/[-_]+/g, " "), project: repo, console: "Unknown", platforms: [],
    repoUrl: base, repoHost: host, owner, repo, version: null, releaseUrl: `${base}/${host === "gitlab" ? "-/releases" : "releases"}`, status: "unknown", updatedAt: "", iconUrl: "", website: "", aiAssisted: false,
    ...extra,
  };
}

// JSON: any object that names something and points at a repository through one of its own fields.
// Links nested in sub-lists (credits, "external links") don't count - they're often dependencies.
export function fromJson(data, id) {
  const out = new Map();
  const visit = (o) => {
    if (Array.isArray(o)) return o.forEach(visit);
    if (!o || typeof o !== "object") return;
    const name = o.name || o.title || o.game || null;
    const ref = name && (repoRef(o.repository, { bare: true }) || repoRef(o.repo, { bare: true }) || repoRef(o.repoUrl) || repoRef(o.projectUrl) || repoRef(o.github) || repoRef(o.url) || repoRef(o.source) || repoRef(o.homepage));
    if (ref && o.enabled !== false && o.deprecated !== true) {
      const c = card(id, ref, {
        title: String(name).replace(/\s+/g, " ").trim(), project: ref.repo,
        console: consoleName(o.sourcePlatform || o.console || o.system || (typeof o.platform === "string" ? o.platform : "")),
        platforms: (Array.isArray(o.platforms) ? o.platforms : []).filter((p) => PLATFORMS.has(p)),
        iconUrl: /^https?:/.test(o.appIconUrl || o.iconUrl || o.icon || o.image || "") ? (o.appIconUrl || o.iconUrl || o.icon || o.image) : "",
        version: o.latestKnownRelease || o.version || null, description: o.descriptionEn || o.description || "",
      });
      if (!out.has(c.id)) out.set(c.id, c);
      return; // this object is one game; its sub-lists are about it, not other games
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") visit(v);
  };
  visit(data);
  return [...out.values()];
}

export function fromText(text, id) {
  const out = new Map();
  for (const m of text.matchAll(/https?:\/\/(?:www\.)?(github|gitlab)\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?=[\/"'<>\s),\]#?]|$)/g)) {
    const ref = repoRef(`https://${m[1]}.com/${m[2]}/${m[3]}`); if (!ref) continue;
    const c = card(id, ref); if (!out.has(c.id)) out.set(c.id, c);
  }
  return [...out.values()];
}

// Data files a page's script loads: string literals ending in .json, resolved against the page, same host only.
export function dataUrlsIn(html, pageUrl) {
  const page = new URL(pageUrl); const seen = new Set();
  for (const m of html.matchAll(/["'`]([^"'`\s<>]*?\.json)(?:\?[^"'`\s<>]*)?["'`]/g)) {
    try { const u = new URL(m[1], page); if (u.host === page.host && /^https?:$/.test(u.protocol)) seen.add(u.href); } catch {}
  }
  return [...seen].slice(0, 3);
}

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(`${url} is too big to read (${Math.round(text.length / 1048576)} MB)`);
  return { text, json: /json/i.test(res.headers.get("content-type") || "") || /^\s*[[{]/.test(text) };
}
const parse = (text) => { try { return JSON.parse(text); } catch { return undefined; } };

export function makeSource(url) {
  const id = `list:${url}`;
  let label; try { label = new URL(url).host + new URL(url).pathname.replace(/\/$/, ""); } catch { label = url; }
  return {
    SOURCE: { id, label, url },
    async fetchSource() {
      const page = await get(url);
      const data = page.json ? parse(page.text) : undefined;
      let games = data !== undefined ? fromJson(data, id) : [];
      if (!games.length) games = fromText(page.text, id);
      // Nothing in the page itself: it's probably drawn by a script from a JSON file - read that.
      if (!games.length && !page.json) {
        for (const u of dataUrlsIn(page.text, url)) {
          try { const d = await get(u); const j = parse(d.text); games = j !== undefined ? fromJson(j, id) : []; if (!games.length) games = fromText(d.text, id); } catch {}
          if (games.length) break;
        }
      }
      if (!games.length) throw new Error(`${label} lists no GitHub or GitLab repositories${page.json ? "" : " (not in the page, nor in any data file it loads)"}`);
      return games;
    },
  };
}
