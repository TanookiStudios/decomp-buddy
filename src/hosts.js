// Where a game's repository lives. Every host-specific call goes through here, so adding a host is one entry
// (and an unknown one fails loudly instead of quietly being treated as GitHub).
import { fetchRepoContext as githubContext, fetchReleases as githubReleases } from "./github.js";
import { fetchRepoContext as gitlabContext } from "./gitlab.js";
import { fetchRepoContext as forgejoContext } from "./forgejo.js";
import { FORGEJO } from "./forges.js";

export const HOSTS = {
  github: { domain: "github.com", context: githubContext, releases: githubReleases, releasesPath: "releases",
    raw: (owner, repo, p) => `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${p}` },
  gitlab: { domain: "gitlab.com", context: gitlabContext, releases: async (ref) => (await gitlabContext(ref)).releases, releasesPath: "-/releases",
    raw: (owner, repo, p) => `https://gitlab.com/${owner}/${repo}/-/raw/HEAD/${p}` },
  ...Object.fromEntries(Object.entries(FORGEJO).map(([id, f]) => [id, { domain: f.domain, context: (ref) => forgejoContext({ ...ref, host: id }),
    releases: async (ref) => (await forgejoContext({ ...ref, host: id })).releases, releasesPath: "releases",
    raw: (owner, repo, p) => `https://${f.domain}/${owner}/${repo}/raw/HEAD/${p}` }])),
};

export function hostOf(host) {
  const h = HOSTS[host || "github"];
  if (!h) throw new Error(`Decomp Buddy doesn't know the repository host "${host}".`);
  return h;
}
export const fetchContextFor = (ref) => hostOf(ref.host).context(ref);
export const repoUrlOf = (host, owner, repo) => `https://${hostOf(host).domain}/${owner}/${repo}`;
