// The Safety Report on a game's page (app: renderer/app.js trustRows, site: DecompBuddy-Site/build.mjs): who uploaded
// the download, the project's license, how long its account has existed. Stored in plans.json entries as `trust`
// (uploadedBy/uploaders by scripts/follow.mjs, license/ownerSince/ownerIsOrg by scripts/trust.mjs). Neutral facts.

const isBot = (u) => /\[bot\]$/i.test(u);
// by: "owner" (the project's owner uploaded every current download), "bot" (all built by the project's own GitHub
// workflow), "regular" (people who uploaded its earlier releases, or cleared by hand), "other" (anyone else).
// uploaders: the people, for the page to name. null when nothing is known.
export function uploadedBy(uploaders, owner, known = []) {
  const ups = [...new Set(uploaders.filter(Boolean))];
  if (!ups.length) return null;
  const people = ups.filter((u) => !isBot(u)), o = String(owner || "").toLowerCase();
  const k = new Set([o, ...known.map((u) => String(u).toLowerCase())]);
  const by = !people.length ? "bot" : people.every((u) => u.toLowerCase() === o) ? "owner" : people.every((u) => k.has(u.toLowerCase())) ? "regular" : "other";
  return { by, uploaders: people.slice(0, 3) };
}
