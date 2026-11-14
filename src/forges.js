// Every place a game's project can live, by host id. Adding a site that runs Forgejo or Gitea (the software Codeberg
// runs) is one line in FORGEJO: the app, the queue, the mirror and the bug-report links all read this table.
// renderer/app.js keeps a copy for the screens (HOST_DOMAIN); test/forges.test.js fails if the two ever differ.
export const FORGEJO = {
  codeberg: { domain: "codeberg.org", label: "Codeberg" },
  notrexed: { domain: "git.notrexed.dev", label: "git.notrexed.dev" }, // Hookshot moved here from GitHub (13 Nov 2026)
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
export const siteOf = (host) => `https://${DOMAIN[host] || DOMAIN.github}`;
export const isForgejo = (host) => Object.hasOwn(FORGEJO, host);
