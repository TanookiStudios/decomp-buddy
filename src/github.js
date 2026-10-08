// Pulls everything Claude needs to understand a decomp/recomp repo:
// README, build/install docs, the file tree, and the latest release assets.

const API = "https://api.github.com";
const DOC_PATTERN = /^(readme|build(ing)?|install(ation)?|setup|getting[-_ ]?started|usage|faq)[^/]*\.(md|txt|rst)$|^docs?\/[^/]+\.md$/i;
const HASH_PATTERN = /(^|\/)([^/]*\.(sha1|md5|sha256|crc32)|checksums?\.txt|hashes?\.txt|baserom[^/]*\.txt|roms?\.txt)$/i;
const MAX_DOCS = 8;
const MAX_DOC_CHARS = 60_000;

export function parseRepoUrl(input) {
  const t = String(input).trim();
  const gl = t.match(/gitlab\.com[/:]([^/\s]+)\/([^/\s#?]+)/i);
  if (gl) return { host: "gitlab", owner: gl[1], repo: gl[2].replace(/\.git$/, "") };
  const m = t.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i) || t.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) throw new Error(`Not a GitHub or GitLab repo link: ${input}`);
  return { host: "github", owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

function headers(accept = "application/vnd.github+json") {
  const h = { Accept: accept, "User-Agent": "decomp-buddy" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh(path, accept) {
  const res = await fetch(`${API}${path}`, { headers: headers(accept) });
  if (res.status === 404) return null;
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error("GitHub rate limit hit. Wait an hour or set GITHUB_TOKEN.");
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return accept?.includes("raw") ? res.text() : res.json();
}

export async function fetchRepoContext({ owner, repo }) {
  const meta = await gh(`/repos/${owner}/${repo}`);
  if (!meta) throw new Error(`Repo not found: ${owner}/${repo}`);
  const branch = meta.default_branch;

  const [readme, tree, releaseList] = await Promise.all([
    gh(`/repos/${owner}/${repo}/readme`, "application/vnd.github.raw+json"),
    gh(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`),
    gh(`/repos/${owner}/${repo}/releases?per_page=100`),
  ]);
  // Newest first. Multi-game repos ship one release per game, so keep them all.
  const releases = (releaseList || []).filter((r) => !r.draft).map((r) => ({
    tag: r.tag_name,
    name: r.name || r.tag_name,
    publishedAt: r.published_at,
    url: r.html_url,
    assets: (r.assets || []).map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url, digest: a.digest || null })),
  }));

  const paths = (tree?.tree || []).filter((e) => e.type === "blob").map((e) => e.path);
  const docPaths = [
    ...paths.filter((p) => DOC_PATTERN.test(p) && !/^readme\.md$/i.test(p)).slice(0, MAX_DOCS),
    ...paths.filter((p) => HASH_PATTERN.test(p)).slice(0, 10), // published checksums, small
  ];
  const docs = [];
  let budget = MAX_DOC_CHARS;
  for (const p of docPaths) {
    if (budget <= 0) break;
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`, { headers: headers("text/plain") });
    if (!res.ok) continue;
    const text = (await res.text()).slice(0, budget);
    budget -= text.length;
    docs.push({ path: p, text });
  }

  return {
    fullName: meta.full_name,
    host: "github",
    url: meta.html_url,
    rawBase: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`,
    description: meta.description || "",
    homepage: meta.homepage || "",
    archived: !!meta.archived, pushedAt: meta.pushed_at || "", stars: meta.stargazers_count || 0,
    defaultBranch: branch,
    zipballUrl: `${API}/repos/${owner}/${repo}/zipball/${encodeURIComponent(branch)}`,
    readme: readme || "",
    docs,
    tree: paths.slice(0, 400),
    treeTruncated: paths.length > 400 || !!tree?.truncated,
    releases,
  };
}
