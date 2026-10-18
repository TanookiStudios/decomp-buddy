// Keeping published install steps on a game's newest release - slowly on purpose.
// A newer release only becomes what Decomp Buddy installs once it is 48 hours old, was uploaded by someone who
// has uploaded this project's releases before (or its owner), and its file scanned clean. Until then everyone keeps
// getting the version that already passed. scripts/follow.mjs runs this on the admin's machine.

export const HOLD_HOURS = 48;

// "Game-v0.3.0-win64.zip" in release v0.3.0 is "Game-v0.6.2-win64.zip" in release v0.6.2. Same name when it has no
// version in it. Otherwise numbers are compared loosely; only a single match counts.
export function matchAsset(oldName, oldTag, assets) {
  const names = (assets || []).map((a) => a.name);
  if (names.includes(oldName)) return assets.find((a) => a.name === oldName);
  const bare = String(oldTag || "").replace(/^[^0-9]*/, "");
  if (bare && oldName.includes(bare)) {
    const [pre, ...rest] = oldName.split(bare), post = rest.join(bare);
    const hits = assets.filter((a) => a.name.startsWith(pre) && a.name.endsWith(post) && /^[0-9][0-9A-Za-z.+_-]*$/.test(a.name.slice(pre.length, a.name.length - post.length)));
    if (hits.length === 1) return hits[0];
  }
  const loose = (n) => n.toLowerCase().replace(/\d+([._-]\d+)*/g, "#");
  const hits = assets.filter((a) => loose(a.name) === loose(oldName));
  if (hits.length === 1) return hits[0];
  // Codename releases ("SoH-Ackbar-Delta-Win64.zip" -> "SoH-Blair-Alfa-Win64.zip"): same first and last part.
  const ends = (n) => { const p = n.toLowerCase().split("-"); return p.length >= 3 ? `${p[0]}|${p[p.length - 1]}` : null; };
  const want = ends(oldName), byEnds = want ? assets.filter((a) => ends(a.name) === want) : [];
  return byEnds.length === 1 ? byEnds[0] : null;
}

// What to do with one published build, given the repo's releases (newest first, as GitHub lists them).
// -> { action: "current" } | { action: "advance", release, asset } | { action: "wait", why, release } | { action: "replan", why }
// collection: the repo ships several games, one release each - a newer release without this game's file is another game.
export function nextStep(build, releases, { owner, now = Date.now(), knownUploaders = [], collection = false } = {}) {
  const all = releases || [], at = all.findIndex((r) => r.tag === build.release_tag);
  // Only releases newer than the one installed now (GitHub lists newest first), stable, with files.
  const newer = (at < 0 ? all : all.slice(0, at)).filter((r) => !r.prerelease && !r.draft && (r.assets || []).length);
  if (!newer.length) return { action: "current" };
  // The newest of those with this build's file: a collection that ships one game per release only moves when this game's file does.
  let newest = null, asset = null;
  for (const r of newer) { asset = matchAsset(build.release_asset, build.release_tag, r.assets); if (asset) { newest = r; break; } }
  if (!newest) {
    if (at < 0) return { action: "replan", why: `${build.release_tag} is gone and no release has a file matching ${build.release_asset}` };
    return collection ? { action: "current" } : { action: "replan", why: `${newer[0].tag} has no file matching ${build.release_asset}` };
  }
  const hours = (now - Date.parse(newest.publishedAt)) / 3600e3;
  if (!(hours >= HOLD_HOURS)) return { action: "wait", why: `${newest.tag} is ${Math.max(0, Math.floor(hours))} hours old (waits ${HOLD_HOURS})`, release: newest, asset };
  const who = asset.uploader;
  // The repo's own GitHub Actions can only upload with the project's write access, like the owner.
  const trusted = !who || who === "github-actions[bot]" || who.toLowerCase() === String(owner || "").toLowerCase() || knownUploaders.some((u) => u.toLowerCase() === who.toLowerCase());
  if (!trusted) return { action: "wait", why: `${asset.name} was uploaded by ${who}, who hasn't uploaded this project's releases before - needs a look`, review: true, release: newest, asset };
  return { action: "advance", release: newest, asset };
}
