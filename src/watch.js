// Tell Me When It's Playable: a bell on Coming Soon games. Kept on this computer only (settings.watch), never sent.
// The same project key for a Coming Soon entry ({ repo: "owner/name", host? }) and a catalog game ({ owner, repo, repoHost }).
export const soonKey = (g) => `${g.host || "github"}:${g.repo}`.toLowerCase();
export const gameKey = (g) => (g.owner ? `${g.repoHost || "github"}:${g.owner}/${g.repo}`.toLowerCase() : null);

// Watched projects that are now in the catalog: [{ key, title, id }], one per project (its first game).
export function newlyPlayable(watch, games) {
  const out = [], seen = new Set();
  for (const g of games) {
    const k = gameKey(g);
    if (k && watch[k] && !seen.has(k)) { seen.add(k); out.push({ key: k, title: watch[k].title || g.title, id: g.id }); }
  }
  return out;
}
