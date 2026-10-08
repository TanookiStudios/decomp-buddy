// Roll back: the release you're replacing is kept in Versions/<tag>/ - only files that came from the
// release, tracked one by one, never your game files, saves, mods or artwork. Two are kept.

import fs from "node:fs";
import path from "node:path";

export const VERSIONS = "Versions";
export const KEEP_VERSIONS = 2;
// Things in a game folder that are never part of a release.
const OURS = new Set([VERSIONS, "Game Files", "Saves Backup", "Decomp Buddy Mods", "decomp-buddy.json", "artwork.png", "artwork.jpg", "folder.ico", "desktop.ini", "Icon\r", ".decomp-buddy-stash"]);

const safeTag = (t) => String(t || "unknown").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
export function listVersions(dir) {
  const v = path.join(dir, VERSIONS);
  if (!fs.existsSync(v)) return [];
  return fs.readdirSync(v, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => {
    const meta = (() => { try { return JSON.parse(fs.readFileSync(path.join(v, e.name, ".version.json"), "utf8")); } catch { return {}; } })();
    return { tag: meta.tag || e.name, dir: path.join(v, e.name), keptAt: meta.keptAt || fs.statSync(path.join(v, e.name)).mtime.toISOString(), files: meta.files || [], seq: BigInt(meta.seq || 0) };
  }).sort((a, b) => b.keptAt.localeCompare(a.keptAt) || (b.seq > a.seq ? 1 : b.seq < a.seq ? -1 : 0));
}

// Move the current release's files into Versions/<tag>/, file by file: anything that didn't come
// from the release (your game files, saves, mods, config you edited next to it) stays exactly where it is.
const pruneEmpty = (dir, root) => { let d = dir; while (d.startsWith(root + path.sep) && d !== root) { try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch { break; } d = path.dirname(d); } };
export function keepVersion(dir, tag, files, { log = () => {}, keep = KEEP_VERSIONS } = {}) {
  const moving = (files || []).filter((f) => !OURS.has(f.split(/[\\/]/)[0]) && fs.existsSync(path.join(dir, f)));
  if (!moving.length) return null;
  const dest = path.join(dir, VERSIONS, safeTag(tag));
  fs.rmSync(dest, { recursive: true, force: true });
  for (const f of moving) { fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true }); fs.renameSync(path.join(dir, f), path.join(dest, f)); pruneEmpty(path.dirname(path.join(dir, f)), dir); }
  fs.writeFileSync(path.join(dest, ".version.json"), JSON.stringify({ tag, files: moving, keptAt: new Date().toISOString(), seq: String(process.hrtime.bigint()) }));
  for (const old of listVersions(dir).slice(keep)) fs.rmSync(old.dir, { recursive: true, force: true });
  log(`Kept ${tag} in ${VERSIONS}/ (roll back from Installed Games if the new one misbehaves).`);
  return dest;
}

// Your placed game files may live inside a folder the release also ships. Move them aside while
// release files are swapped, then put them back exactly where they were.
export function stashPlaced(dir, placedPaths) {
  const stash = path.join(dir, ".decomp-buddy-stash");
  const moved = [];
  placedPaths.forEach((p, i) => {
    if (!fs.existsSync(p) || !path.resolve(p).startsWith(path.resolve(dir) + path.sep)) return;
    const to = path.join(stash, String(i), path.basename(p));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(p, to); moved.push([to, p]);
  });
  return () => { for (const [from, to] of moved) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.rmSync(to, { recursive: true, force: true }); fs.renameSync(from, to); } fs.rmSync(stash, { recursive: true, force: true }); };
}

// Swap: current release files -> Versions/<currentTag>, Versions/<tag> files -> live.
export function rollBack(dir, { currentTag, currentFiles, tag, placed = [], log = () => {} }) {
  const target = listVersions(dir).find((v) => v.tag === tag);
  if (!target) throw new Error(`No kept copy of ${tag}.`);
  const unstash = stashPlaced(dir, placed);
  const skipped = [];
  try {
    const tmp = path.join(dir, VERSIONS, `.restoring-${Date.now()}`);
    fs.renameSync(target.dir, tmp);
    keepVersion(dir, currentTag, currentFiles, { log, keep: KEEP_VERSIONS + 1 });
    for (const f of target.files) {
      const to = path.join(dir, f);
      if (fs.existsSync(to)) { skipped.push(f); continue; } // something of yours is there - never overwrite it
      fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(path.join(tmp, f), to);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  } finally { unstash(); }
  if (skipped.length) log(`  left ${skipped.length} file(s) of yours in place instead of the old release's copy: ${skipped.slice(0, 5).join(", ")}`);
  log(`Rolled back to ${tag}.`);
  return { tag, files: target.files.filter((f) => !skipped.includes(f)) };
}
