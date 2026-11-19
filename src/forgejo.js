// Forgejo/Gitea twin of github.js/gitlab.js (Codeberg, and any site in src/forges.js): same context shape so
// plan/setup/verify don't care where a repo lives.
import { forgejoOf, FORGEJO as FORGEJO_TABLE } from "./forges.js";
const DOC_PATTERN = /^(readme|build(ing)?|install(ation)?|setup|getting[-_ ]?started|usage|faq)[^/]*\.(md|txt|rst)$|^docs?\/[^/]+\.md$/i;
const HASH_PATTERN = /(^|\/)([^/]*\.(sha1|md5|sha256|crc32)|checksums?\.txt|hashes?\.txt|baserom[^/]*\.txt|roms?\.txt)$/i;

const h = { "User-Agent": "decomp-buddy", Accept: "application/json" };

export const releasesOf = (list) => (list || []).filter((r) => !r.draft).map((r) => ({
  tag: r.tag_name, name: r.name || r.tag_name, publishedAt: r.published_at, prerelease: !!r.prerelease, url: r.html_url,
  assets: (r.assets || []).map((a) => ({ name: a.name, size: a.size || 0, url: a.browser_download_url, digest: null })),
}));

export async function fetchRepoContext({ owner, repo, host = "codeberg" }) {
  const f = forgejoOf(host); if (!f) throw new Error(`Decomp Buddy doesn't know the repository host "${host}".`);
  const SITE = `https://${f.domain}`, API = `${SITE}/api/v1`;
  const cb = async (pathname) => {
    const res = await fetch(`${API}${pathname}`, { headers: h, signal: AbortSignal.timeout(30_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${f.label} ${res.status} for ${pathname}`);
    return res.json();
  };
  // A site we only know by its address might not be a Forgejo/Gitea site at all (its answer isn't the API's JSON).
  const meta = await cb(`/repos/${owner}/${repo}`).catch((err) => { if (FORGEJO_TABLE[host]) throw err; return null; });
  if (!meta) throw new Error(FORGEJO_TABLE[host] ? `Repo not found on ${f.label}: ${owner}/${repo}` : `Couldn't read ${owner}/${repo} on ${f.label}. Decomp Buddy reads projects on GitHub, GitLab and Forgejo/Gitea sites like Codeberg.`);
  const branch = meta.default_branch || "main";
  const rawBase = `${SITE}/${owner}/${repo}/raw/branch/${branch}/`;
  const raw = (p) => fetch(rawBase + p.split("/").map(encodeURIComponent).join("/"), { headers: h, signal: AbortSignal.timeout(30_000) }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  // Forgejo hands the file list out a page at a time (often 1,000 entries): read up to 10 pages, so a README that sorts
  // past the first page (git.notrexed.dev's Hookshot: page 2 of 3) is still found.
  const treePages = async () => {
    const all = []; let first = null;
    for (let page = 1; page <= 10; page++) {
      const t = await cb(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=true&per_page=1000&page=${page}`);
      if (!t) break; first ||= t; all.push(...(t.tree || []));
      if (!t.truncated || !(t.tree || []).length) return { ...first, tree: all, truncated: false };
    }
    return first && { ...first, tree: all, truncated: true };
  };
  const [tree, releaseList] = await Promise.all([treePages(), cb(`/repos/${owner}/${repo}/releases?limit=50`)]);
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
    fullName: meta.full_name || `${owner}/${repo}`, host, url: meta.html_url || `${SITE}/${owner}/${repo}`, description: meta.description || "", homepage: meta.website || "", defaultBranch: branch,
    archived: !!meta.archived, pushedAt: meta.updated_at || "", stars: meta.stars_count || 0,
    zipballUrl: `${SITE}/${owner}/${repo}/archive/${encodeURIComponent(branch)}.zip`,
    rawBase,
    readme, docs, tree: paths.slice(0, 400), treeTruncated: paths.length > 400 || !!tree?.truncated || (tree?.total_count || 0) > (tree?.tree || []).length, releases: releasesOf(releaseList),
  };
}
