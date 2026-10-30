// Lists: groups of games picked by rules (not by hand) and rebuilt with every catalog build, for the website's /lists
// pages and the app's Browse filter. Works on the public catalog (facts.steamDeck, listedAt, size) and the app's own
// catalog (facts.steam_deck; no listedAt or size, so those two lists are site-only).
const F = (g) => g.facts || {}, has = (g, k) => !!(F(g).features && F(g).features[k]);
const deck = (g) => F(g).steamDeck || F(g).steam_deck;
const done = (g) => ["playable", "mostly"].includes(F(g).completeness);
export const score = (g) => ({ playable: 4, mostly: 3, partial: 1 }[F(g).completeness] || 0) + Object.keys(F(g).features || {}).length + (deck(g) === "verified" ? 1 : 0);

export const LISTS = [
  { slug: "best-nintendo-64", title: "Best Nintendo 64 Ports", blurb: "N64 games you can play start to finish, with the most extras first.", max: 30, test: (g) => g.console === "Nintendo 64" && done(g) },
  { slug: "great-on-steam-deck", title: "Great On Steam Deck", blurb: "Their own pages say they work on the Deck, or they run on Linux and play start to finish.", max: 40, test: (g) => ["verified", "works"].includes(deck(g)) || ((g.platforms || []).includes("Linux") && done(g)) },
  { slug: "play-together", title: "Play Together", blurb: "Local multiplayer on one screen, or online play.", max: 40, test: (g) => has(g, "coop") || has(g, "online") },
  { slug: "looks-great", title: "Looks Great On Modern Screens", blurb: "Widescreen, plus higher resolution or a smoother frame rate.", max: 40, test: (g) => has(g, "widescreen") && (has(g, "hd") || has(g, "fps60")) },
  { slug: "under-100-mb", title: "Under 100 MB", blurb: "Small downloads that play start to finish.", max: 40, needs: "size", test: (g) => g.size > 0 && g.size < 100 * 1048576 && done(g) },
  { slug: "new-this-month", title: "New This Month", blurb: "Added to Decomp Buddy in the last 30 days, newest first.", max: 60, needs: "listedAt", test: (g, now) => !!g.listedAt && now - Date.parse(g.listedAt) < 30 * 864e5, sort: (a, b) => b.listedAt.localeCompare(a.listedAt) },
];

// { slug: [games] } - each list sorted (best first, or newest first) and capped. now: ms, for "this month".
export function buildLists(games, now = Date.now()) {
  const out = {};
  // One port per game: the best one ("Crash Team Racing" and "Crash Team Racing (OCTR)" are the same game).
  const gameOf = (g) => `${g.title.replace(/\s*\(.*\)$/, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase()}|${g.console}`;
  for (const l of LISTS) {
    const seen = new Set();
    out[l.slug] = games.filter((g) => F(g).completeness !== "wip" && l.test(g, now)).sort(l.sort || ((a, b) => score(b) - score(a) || a.title.localeCompare(b.title)))
      .filter((g) => !seen.has(gameOf(g)) && seen.add(gameOf(g))).slice(0, l.max);
  }
  return out;
}
