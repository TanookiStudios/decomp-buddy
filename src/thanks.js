// Play time and Thank The Developer: after an hour with a game, once, a quiet note to thank the people who made it.
export const THANK_AFTER = 60; // minutes
export function thankDue(library) {
  return library.filter((g) => (g.playMinutes || 0) >= THANK_AFTER && !g.thanked && g.repoUrl && !g.onDevice)
    .sort((a, b) => (b.lastPlayed || "").localeCompare(a.lastPlayed || ""))[0] || null;
}
// "12 hours played", "1 hour played", "45 minutes played"; nothing under a minute.
export function playedText(minutes) {
  const m = Math.round(minutes || 0); if (m < 1) return "";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} played`;
  const h = Math.round(m / 60); return `${h} hour${h === 1 ? "" : "s"} played`;
}
