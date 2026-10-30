// Best Version For You: when players say a game's newest version doesn't start and the one before it ran well, the
// published install steps go back to that one (scripts/bestversion.mjs) until a newer release comes out.
export const MIN_BAD = 3, MIN_GOOD = 2;

// counts: { runs, issues, no } per tag from player reports. True when `current` should give way to `previous`.
export function shouldRollBack(counts, current, previous) {
  const c = counts[current], p = counts[previous];
  if (!c || !p || current === previous) return false;
  const total = c.runs + c.issues + c.no;
  return total >= MIN_BAD && c.no * 2 > total && p.runs >= MIN_GOOD && p.runs > p.no;
}
