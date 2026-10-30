// What Should I Play? Three answers -> three games. Used by the app (main process, ipc "pick:games") and, as the same
// source, by the website's /what-should-i-play page (its build inlines pickGames). Keep it free of imports.
// games: catalog entries ({ id, title, console, platforms, facts: { completeness, steamDeck (or the app's steam_deck), features } }).
// answers: { console: "" | name, how: "alone" | "together" | "online", matters: "looks" | "complete" | "deck" }.
export function pickGames(games, answers = {}, { n = 3, rand = Math.random } = {}) {
  const f = (g) => g.facts || {}, has = (g, k) => !!(f(g).features && f(g).features[k]);
  const notWip = (g) => f(g).completeness !== "wip";
  const tests = [
    (g) => !answers.console || g.console === answers.console,
    (g) => answers.how === "together" ? has(g, "coop") : answers.how === "online" ? has(g, "online") : true,
    (g) => answers.matters === "looks" ? has(g, "widescreen") || has(g, "hd") || has(g, "fps60")
      : answers.matters === "complete" ? ["playable", "mostly"].includes(f(g).completeness)
      : answers.matters === "deck" ? ["verified", "works"].includes(f(g).steamDeck || f(g).steam_deck) || (g.platforms || []).includes("Linux") : true,
  ];
  // Everything asked for; if nothing fits, let go of "what matters", then "how" - and say so.
  let pool = [], relaxed = 0;
  for (; relaxed < tests.length; relaxed++) { pool = games.filter((g) => notWip(g) && tests.slice(0, tests.length - relaxed).every((t) => t(g))); if (pool.length) break; }
  const score = (g) => ({ playable: 4, mostly: 3, partial: 1 }[f(g).completeness] || 0) + Object.keys(f(g).features || {}).length + ((f(g).steamDeck || f(g).steam_deck) === "verified" ? 1 : 0);
  // The best 30, then a random three of different games (two ports of one game aren't two picks).
  const best = pool.slice().sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title)).slice(0, 30), out = [], seen = new Set();
  while (best.length && out.length < n) {
    const g = best.splice(Math.floor(rand() * best.length), 1)[0], key = `${g.title.replace(/\s*\(.*\)$/, "").toLowerCase()}|${g.console}`;
    if (!seen.has(key)) { seen.add(key); out.push(g); }
  }
  return { picks: out, relaxed: relaxed > 0 && pool.length > 0 };
}
