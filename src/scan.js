// Malware scans of published downloads (scripts/scan.mjs runs them on the admin's machine with ClamAV).
// scans.json: { updatedAt, files: { "<planKey>/<release_tag or *>/<asset>": { sha256, size, tag, at, engine, clean, signature? } } }
// scans-reviewed.json: { "<sha256>": { reason, at } } - a flagged file looked at by hand and found to be a false alarm.
// It is per file, never per signature: a real piece of malware can trip the same over-broad signature.
// A clean (or reviewed-and-cleared) result is copied onto the published plan as build.scanned, and setup
// then insists the download matches that exact file - so a file swapped after the scan is never installed.

export const scanKey = (planKey, build) => `${planKey}/${build.release_tag || "*"}/${build.release_asset}`.toLowerCase();

// The release + asset setup installs for this build: the plan's tag if it has the file, else any release that does.
export function pickRelease(releases, build) {
  const has = (r) => r.assets.some((a) => a.name === build.release_asset);
  const release = (releases || []).find((r) => (build.release_tag ? r.tag === build.release_tag : true) && has(r)) || (releases || []).find(has) || null;
  return { release, asset: release?.assets.find((a) => a.name === build.release_asset) || null };
}

// Every downloadable build in plans.json: [{ planKey, target, game, build }] - plus, with { next: true }, the newer
// release each one is waiting to move to (build.next, written by scripts/follow.mjs), so it gets scanned first.
export function releaseBuilds(plans, { next = false } = {}) {
  const out = [];
  for (const [planKey, e] of Object.entries(plans?.plans || {}))
    for (const [target, t] of Object.entries(e.targets || {}))
      for (const game of t?.games || [])
        if (game.build?.method === "release" && game.build.release_asset) {
          out.push({ planKey, target, game, build: game.build });
          if (next && game.build.next?.release_asset) out.push({ planKey, target, game, build: game.build.next, isNext: true });
        }
  return out;
}

// Writes build.scanned from the scan records (and removes stale ones). Returns how many builds carry a result.
export function applyScans(plans, scans, reviewed = {}) {
  let n = 0;
  for (const { planKey, build } of releaseBuilds(plans, { next: true })) {
    const r = scans?.files?.[scanKey(planKey, build)];
    delete build.scanned;
    // A scan that ran out of time or size limits isn't a verdict: the file counts as not scanned yet.
    if (!r || r.incomplete || /^Heuristics\.Limits\.Exceeded/.test(r.signature || "")) continue;
    build.scanned = r.clean || reviewed[r.sha256]
      ? { sha256: r.sha256, at: r.at, engine: r.engine }
      : { flagged: true, signature: r.signature || "unknown", at: r.at, engine: r.engine };
    n++;
  }
  return n;
}

// One line for a whole repo's published plan: every download scanned clean -> { at, engine, files }; any flagged -> { flagged };
// anything not scanned yet (or no downloads at all) -> null.
export function scanSummary(entry) {
  const builds = releaseBuilds({ plans: { x: entry || {} } }).map((b) => b.build);
  if (!builds.length) return null;
  if (builds.some((b) => b.scanned?.flagged)) return { flagged: true };
  if (!builds.every((b) => b.scanned?.sha256)) return null;
  const at = builds.map((b) => b.scanned.at).sort()[0];
  return { at, engine: builds[0].scanned.engine, files: new Set(builds.map((b) => b.scanned.sha256)).size };
}
