// Source: portsdr.com - one static HTML page of <article class="port-card">.
// Parsed with regexes because the page is machine-generated and uniform.

export const SOURCE = { id: "portsdr", label: "portsdr.com", url: "https://portsdr.com/" };

const decode = (s) => String(s ?? "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n)).trim();
const attr = (html, name) => { const m = html.match(new RegExp(`\\b${name}="([^"]*)"`)); return m ? decode(m[1]) : ""; };
const text = (html, re) => { const m = html.match(re); return m ? decode(m[1].replace(/<[^>]+>/g, "")) : ""; };
const link = (html, label) => { const m = html.match(new RegExp(`<a href="([^"]*)"[^>]*>${label}</a>`)); return m ? decode(m[1]) : ""; };

export function parseRepo(url) {
  const m = url.match(/^https?:\/\/(github|gitlab)\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  return m ? { host: m[1].toLowerCase(), owner: m[2], repo: m[3].replace(/\.git$/, "") } : { host: null, owner: null, repo: null };
}

export async function fetchSource() {
  const res = await fetch(SOURCE.url, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${SOURCE.label} answered ${res.status}`);
  const games = parseCatalog(await res.text());
  if (!games.length) throw new Error(`${SOURCE.label} page had no game cards - layout changed?`);
  return games;
}

export function parseCatalog(html) {
  const cards = html.match(/<article class="port-card"[\s\S]*?<\/article>/g) || [];
  return cards.map((c) => {
    const repoUrl = link(c, "Repository");
    const { host, owner, repo } = parseRepo(repoUrl);
    const project = text(c, /<p class="project-name">([\s\S]*?)<\/p>/);
    const versionText = text(c, /<a href="[^"]*"[^>]*>(Version [^<]*)<\/a>/).replace(/^Version\s+/, "");
    const statusText = text(c, /<span class="release-status">([^<]*)<\/span>/).toLowerCase();
    return {
      source: SOURCE.id,
      id: host ? `${host}:${owner}/${repo}`.toLowerCase() : `project:${project.toLowerCase()}`,
      title: text(c, /<h3>([\s\S]*?)<\/h3>/),
      project,
      console: attr(c, "data-original-platform") || text(c, /<p class="platform">([^<]*)<\/p>/),
      platforms: attr(c, "data-platforms").split("|").filter(Boolean),
      repoUrl, repoHost: host, owner, repo,
      version: versionText || null,
      releaseUrl: (c.match(/<a href="([^"]*)"[^>]*>Version /) || [])[1] || "",
      status: statusText.startsWith("pre") ? "prerelease" : statusText === "latest" ? "latest" : "none",
      updatedAt: attr(c, "data-updated-at") || (c.match(/<time datetime="([^"]*)"/) || [])[1] || "",
      iconUrl: (c.match(/<img src="([^"]*)"/) || [])[1] || "",
      website: link(c, "Project Website"),
      texturesUrl: link(c, "Textures"),
      aiAssisted: /class="ai-assisted"/.test(c),
    };
  });
}

