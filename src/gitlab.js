// GitLab twin of github.js: same context shape so plan/setup/verify don't care where a repo lives.

const API = "https://gitlab.com/api/v4";
const DOC_PATTERN = /^(readme|build(ing)?|install(ation)?|setup|getting[-_ ]?started|usage|faq)[^/]*\.(md|txt|rst)$|^docs?\/[^/]+\.md$/i;
const HASH_PATTERN = /(^|\/)([^/]*\.(sha1|md5|sha256|crc32)|checksums?\.txt|hashes?\.txt|baserom[^/]*\.txt|roms?\.txt)$/i;

const h = { "User-Agent": "decomp-buddy" };
async function gl(pathname) {
  const res = await fetch(`${API}${pathname}`, { headers: h, signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitLab ${res.status} for ${pathname}`);
  return res.json();
}

// Package-file links have no extension in their name; the redirect's Content-Disposition does.
async function assetName(link) {
  if (/\.[a-z0-9]{2,5}$/i.test(link.name)) return link.name;
  try {
    const res = await fetch(link.direct_asset_url || link.url, { method: "HEAD", redirect: "follow", headers: h, signal: AbortSignal.timeout(15_000) });
    const cd = res.headers.get("content-disposition") || "";
    const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i);
    if (m) return decodeURIComponent(m[1]);
    const ct = res.headers.get("content-type") || "";
    if (/zip/.test(ct)) return `${link.name}.zip`;
  } catch {}
  return link.name;
}

export async function fetchRepoContext({ owner, repo }) {
  const id = encodeURIComponent(`${owner}/${repo}`);
  const meta = await gl(`/projects/${id}`);
  if (!meta) throw new Error(`Repo not found on GitLab: ${owner}/${repo}`);
  const branch = meta.default_branch || "main";
  const raw = (p) => fetch(`${API}/projects/${id}/repository/files/${encodeURIComponent(p)}/raw?ref=${encodeURIComponent(branch)}`, { headers: h, signal: AbortSignal.timeout(30_000) }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const [tree, releaseList] = await Promise.all([
    gl(`/projects/${id}/repository/tree?recursive=true&per_page=100`),
    gl(`/projects/${id}/releases?per_page=50`),
  ]);
  const paths = (tree || []).filter((e) => e.type === "blob").map((e) => e.path);
  const readmePath = paths.find((p) => /^readme(\.md|\.rst|\.txt)?$/i.test(p)) || "README.md";
  const readme = await raw(readmePath);
  const docs = [];
  let budget = 60_000;
  for (const p of [...paths.filter((p) => DOC_PATTERN.test(p) && !/^readme\.md$/i.test(p)).slice(0, 8), ...paths.filter((p) => HASH_PATTERN.test(p)).slice(0, 10)]) {
    if (budget <= 0) break;
    const text = (await raw(p)).slice(0, budget); budget -= text.length;
    if (text) docs.push({ path: p, text });
  }
  const releases = [];
  for (const r of releaseList || []) {
    const assets = [];
    for (const l of r.assets?.links || []) assets.push({ name: await assetName(l), size: 0, url: l.direct_asset_url || l.url, digest: null });
    releases.push({ tag: r.tag_name, name: r.name || r.tag_name, publishedAt: r.released_at, url: r._links?.self || `https://gitlab.com/${owner}/${repo}/-/releases/${r.tag_name}`, assets });
  }
  return {
    fullName: `${owner}/${repo}`, host: "gitlab", url: meta.web_url, description: meta.description || "", homepage: "", defaultBranch: branch,
    archived: !!meta.archived, pushedAt: meta.last_activity_at || "", stars: meta.star_count || 0,
    zipballUrl: `${API}/projects/${id}/repository/archive.zip?sha=${encodeURIComponent(branch)}`,
    rawBase: `https://gitlab.com/${owner}/${repo}/-/raw/${branch}/`,
    readme, docs, tree: paths.slice(0, 400), treeTruncated: paths.length > 400, releases,
  };
}
