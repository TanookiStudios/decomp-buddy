// Uninstall Game → Move Rom Out Safely: the game files you supplied (ROMs, disc images, BIOS, a .cue's tracks)
// leave the game folder before it goes to the Trash. Each uninstall gets its own folder under the kept-files folder,
// a new one ("Title (2)") if any name would collide, so nothing is ever overwritten and a .cue keeps its tracks.
import fs from "node:fs";
import path from "node:path";

// The files setup placed for this game that are still there, never anything outside the game folder.
export function romsOf(folder, manifest) {
  const root = path.resolve(folder), out = [];
  for (const f of manifest?.plan?.game_files || []) {
    if (!f.placed?.name) continue;
    const dir = path.resolve(root, f.drop_into || "Game Files");
    for (const name of [f.placed.name, ...(f.placed.companions || [])]) {
      const p = path.resolve(dir, name);
      if (p.startsWith(root + path.sep) && fs.existsSync(p) && !out.includes(p)) out.push(p);
    }
  }
  return out;
}

const cleanName = (t) => String(t || "Game").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().slice(0, 100) || "Game";

// Moves them into <keepDir>/<Title>/. Returns { dir, files: [new paths] } ({ dir: null, files: [] } when there's nothing).
export function moveRomsOut(folder, manifest, keepDir) {
  const files = romsOf(folder, manifest);
  if (!files.length) return { dir: null, files: [] };
  const base = path.join(keepDir, cleanName(manifest.displayName || manifest.plan?.game_title || path.basename(folder)));
  let dir = base;
  for (let n = 2; files.some((f) => fs.existsSync(path.join(dir, path.basename(f)))); n++) dir = `${base} (${n})`;
  fs.mkdirSync(dir, { recursive: true });
  const moved = [];
  for (const src of files) {
    const dest = path.join(dir, path.basename(src));
    try { fs.renameSync(src, dest); }
    catch (err) {
      if (err.code !== "EXDEV") throw err; // another drive: copy, check the size, then delete
      fs.cpSync(src, dest, { recursive: true });
      if (fs.statSync(src).isFile() && fs.statSync(dest).size !== fs.statSync(src).size) throw new Error(`Copying ${path.basename(src)} didn't finish - the game was left installed.`);
      fs.rmSync(src, { recursive: true, force: true });
    }
    moved.push(dest);
  }
  return { dir, files: moved };
}
