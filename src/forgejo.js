// Codeberg (Forgejo) twin of github.js/gitlab.js: same context shape so plan/setup/verify don't care where a repo lives.

const SITE = "https://codeberg.org", API = `${SITE}/api/v1`;
const DOC_PATTERN = /^(readme|build(ing)?|install(ation)?|setup|getting[-_ ]?started|usage|faq)[^/]*\.(md|txt|rst)$|^docs?\/[^/]+\.md$/i;
const HASH_PATTERN = /(^|\/)([^/]*\.(sha1|md5|sha256|crc32)|checksums?\.txt|hashes?\.txt|baserom[^/]*\.txt|roms?\.txt)$/i;

const h = { "User-Agent": "decomp-buddy", Accept: "application/json" };
async function cb(pathname) {
  const res = await fetch(`${API}${pathname}`, { headers: h, signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Codeberg ${res.status} for ${pathname}`);
  return res.json();
}

export const releasesOf = (list) => (list || []).filter((r) => !r.draft).map((r) => ({
  tag: r.tag_name, name: r.name || r.tag_name, publishedAt: r.published_at, prerelease: !!r.prerelease, url: r.html_url,
  assets: (r.assets || []).map((a) => ({ name: a.name, size: a.size || 0, url: a.browser_download_url, digest: null })),
}));

export async function fetchRepoContext({ owner, repo }) {
  const meta = await cb(`/repos/${owner}/${repo}`);
  if (!meta) throw new Error(`Repo not found on Codeberg: ${owner}/${repo}`);
  const branch = meta.default_branch || "main";
  const rawBase = `${SITE}/${owner}/${repo}/raw/branch/${branch}/`;
  const raw = (p) => fetch(rawBase + p.split("/").map(encodeURIComponent).join("/"), { headers: h, signal: AbortSignal.timeout(30_000) }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const [tree, releaseList] = await Promise.all([
    cb(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=true&per_page=10000`),
    cb(`/repos/${owner}/${repo}/releases?limit=50`),
  ]);
  const paths = (tree?.tree || []).filter((e) => e.type === "blob").map((e) => e.path);
  const readmePath = paths.find((p) => /^readme(\.md|\.rst|\.txt)?$/i.test(p)) || "README.md";
  const readme = await raw(readmePath);
  const docs = [];
  let budget = 60_000;
  for (const p of [...paths.filter((p) => DOC_PATTERN.test(p) && !/^readme\.md$/i.test(p)).slice(0, 8), ...paths.filter((p) => HASH_PATTERN.test(p)).slice(0, 10)]) {
    if (budget <= 0) break;
    const text = (await raw(p)).slice(0, budget); budget -= text.length;
    if (text) docs.push({ path: p, text });
  }
  return {
    fullName: meta.full_name || `${owner}/${repo}`, host: "codeberg", url: meta.html_url || `${SITE}/${owner}/${repo}`, description: meta.description || "", homepage: meta.website || "", defaultBranch: branch,
    archived: !!meta.archived, pushedAt: meta.updated_at || "", stars: meta.stars_count || 0,
    zipballUrl: `${SITE}/${owner}/${repo}/archive/${encodeURIComponent(branch)}.zip`,
    rawBase,
    readme, docs, tree: paths.slice(0, 400), treeTruncated: paths.length > 400 || !!tree?.truncated || (tree?.total_count || 0) > (tree?.tree || []).length, releases: releasesOf(releaseList),
  };
}
