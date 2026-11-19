// Every place a game's project can live, by host id. Adding a site that runs Forgejo or Gitea (the software Codeberg
// runs) is one line in FORGEJO: the app, the queue, the mirror and the bug-report links all read this table.
// renderer/app.js keeps a copy for the screens (HOST_DOMAIN); test/forges.test.js fails if the two ever differ.
export const FORGEJO = {
  codeberg: { domain: "codeberg.org", label: "Codeberg" },
  notrexed: { domain: "git.notrexed.dev", label: "git.notrexed.dev" }, // Hookshot moved here from GitHub (13 Nov 2026)
  magicbean: { domain: "git.magicbean.dev", label: "git.magicbean.dev" }, // Longshot, Hookshot's continuation (17 Nov 2026)
};
export const DOMAIN = { github: "github.com", gitlab: "gitlab.com", ...Object.fromEntries(Object.entries(FORGEJO).map(([id, f]) => [id, f.domain])) };
const BY_DOMAIN = Object.fromEntries(Object.entries(DOMAIN).map(([id, d]) => [d, id]));
const esc = (d) => d.replace(/[.]/g, "\\.");
/** Matches a project link on any known host, anywhere in a string: [full, domain, owner, repo]. */
export const LINK_RE = new RegExp(`https?:\\/\\/(?:www\\.)?(${Object.values(DOMAIN).map(esc).join("|")})\\/([A-Za-z0-9_.-]+)\\/([A-Za-z0-9_.-]+?)(?=\\.git(?:[/#?]|$)|[/"'<>\\s),\\]#?]|$)`, "g");
/** { host, owner, repo } for a project link on a known host, or null. */
export function refFromUrl(s) {
  const m = String(s || "").trim().match(new RegExp(`^(?:https?:\\/\\/)?(?:www\\.)?(${Object.values(DOMAIN).map(esc).join("|")})[/:]([A-Za-z0-9_.-]+)\\/([A-Za-z0-9_.-]+?)(?:\\.git)?(?:[/#?].*)?$`, "i"));
  return m ? { host: BY_DOMAIN[m[1].toLowerCase()], owner: m[2], repo: m[3] } : null;
}
// Any other Forgejo/Gitea site needs no entry: its address is its id ("git.example.org"), so a link to it works without
// an app update. Only a real host name counts - never an IP address, "localhost" or one of the sites above.
export const isSiteDomain = (s) => /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(String(s)) && !BY_DOMAIN[s];
/** { domain, label } for a Forgejo/Gitea host id: one in the table, or a site's own address. */
export const forgejoOf = (host) => FORGEJO[host] || (isSiteDomain(host) ? { domain: host, label: host } : null);
export const domainOf = (host) => DOMAIN[host] || forgejoOf(host)?.domain || null;
export const siteOf = (host) => `https://${domainOf(host) || DOMAIN.github}`;
export const isForgejo = (host) => !!forgejoOf(host);
/** refFromUrl, plus a project on any other site (https://<site>/<owner>/<repo>), whose host id is the site's address.
 *  Only for links that are meant to be a project (one a person pasted, a list's repoUrl) - never for any link in a page. */
export function anyRefFromUrl(s) {
  const known = refFromUrl(s); if (known) return known;
  const m = String(s || "").trim().match(/^https?:\/\/([^/:?#@]+)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/i);
  const domain = m?.[1].toLowerCase().replace(/^www\./, "");
  return m && isSiteDomain(domain) && !/^\.+$/.test(m[2]) && !/^\.+$/.test(m[3]) ? { host: domain, owner: m[2], repo: m[3] } : null;
}
