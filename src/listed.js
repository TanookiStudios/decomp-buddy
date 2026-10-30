// When each game first joined the catalog (catalog.json `listedAt`), for the New Ports feed and "New This Month".
// seen: { gameId: "YYYY-MM-DD" }, kept between builds. A game new to it gets its find's addedAt when it was found by
// hand, else today - except on the very first build, when nobody knows: those get `baseline`, so the feed doesn't
// announce the whole catalog as new.
export function stampListed(games, seen, { addedAt = {}, today, baseline }) {
  const first = !Object.keys(seen).length;
  for (const g of games) {
    const found = g.repo && addedAt[g.repo.toLowerCase()];
    seen[g.id] ||= String(found || (first ? baseline : today)).slice(0, 10);
    g.listedAt = seen[g.id];
  }
  return seen;
}
