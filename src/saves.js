// Save backups. Where a port keeps its saves comes from its README (plan facts, grounded in the text).
// Backups are zips inside the game folder ("Saves Backup/<date>.zip") with a small manifest that
// records where each folder came from, so Restore puts things back exactly.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { path7za } from "./archive.js";

const run = promisify(execFile);
export const BACKUP_DIR = "Saves Backup";
const HOST = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";

// "%LOCALAPPDATA%\\Zelda\\saves", "~/.config/x", "$XDG_DATA_HOME/x", "./saves", "saves/" -> absolute path.
// Prose ("Same directory as soh.exe") -> null: we don't guess.
export function expandSavePath(p, { gameDir, env = process.env, home = os.homedir(), platform = HOST } = {}) {
  let s = String(p || "").trim().replace(/^["'`]|["'`]$/g, "");
  if (!s || /\s{1}\w+\s\w+\s/.test(s) && !/[\\/%$~]/.test(s)) return null;
  const winVar = { APPDATA: env.APPDATA || path.join(home, "AppData", "Roaming"), LOCALAPPDATA: env.LOCALAPPDATA || path.join(home, "AppData", "Local"), USERPROFILE: home, HOME: home };
  s = s.replace(/%([A-Z_]+)%/gi, (m, v) => winVar[v.toUpperCase()] ?? m);
  s = s.replace(/\$\{?(XDG_DATA_HOME|XDG_CONFIG_HOME|HOME)\}?/g, (m, v) => ({ XDG_DATA_HOME: env.XDG_DATA_HOME || path.join(home, ".local", "share"), XDG_CONFIG_HOME: env.XDG_CONFIG_HOME || path.join(home, ".config"), HOME: home })[v]);
  s = s.replace(/^<game[ _-]?(?:folder|dir|directory)>(?=[\\/]|$)[\\/]?/i, "./"); // "<game folder>/data/saves" = relative
  s = s.replace(/^~(?=[\\/]|$)/, home);
  if (/%[A-Z_]+%|\$[A-Z_]/i.test(s)) return null; // a variable we couldn't resolve
  s = s.replace(/<username>|<user>/gi, path.basename(home));
  const abs = path.isAbsolute(s) || /^[A-Za-z]:[\\/]/.test(s);
  if (!abs && !gameDir) return null;
  return path.normalize(abs ? s.replace(/\\/g, platform === "windows" ? "\\" : "/") : path.join(gameDir, s.replace(/\\/g, "/")));
}

// A "save folder" that is the game folder itself (or holds it) can't be backed up or restored on its
// own: the backup would swallow the game and its earlier backups, and a restore would wipe the game.
const holdsGame = (p, gameDir) => { if (!gameDir) return false; const a = path.resolve(p), g = path.resolve(gameDir); return a === g || g.startsWith(a + path.sep); };
export function savePathsFor(facts, { gameDir, platform = HOST, env, home } = {}) {
  return (facts?.save_paths || []).filter((p) => p.platform === platform || p.platform === "any")
    .map((p) => ({ documented: p.path, path: expandSavePath(p.path, { gameDir, env, home, platform }) }))
    .filter((p) => p.path && !holdsGame(p.path, gameDir));
}

export function listBackups(gameDir) {
  const d = path.join(gameDir, BACKUP_DIR);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith(".zip")).sort().reverse().map((f) => ({ file: path.join(d, f), name: f, size: fs.statSync(path.join(d, f)).size }));
}

export async function backupSaves(gameDir, paths, { reason = "manual", log = () => {} } = {}) {
  const found = paths.filter((p) => fs.existsSync(p.path));
  if (!found.length) return null;
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "db-saves-"));
  try {
    found.forEach((p, i) => fs.cpSync(p.path, path.join(stage, String(i), path.basename(p.path)), { recursive: true }));
    fs.writeFileSync(path.join(stage, "decomp-buddy-saves.json"), JSON.stringify({ reason, at: new Date().toISOString(), paths: found.map((p, i) => ({ i, path: p.path, documented: p.documented })) }, null, 2));
    const dir = path.join(gameDir, BACKUP_DIR); fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)} ${reason}.zip`);
    await run(path7za(), ["a", "-tzip", "-bd", "-y", out, "."], { cwd: stage, maxBuffer: 16 * 1024 * 1024 });
    log(`Saves backed up (${reason}): ${path.basename(out)}`);
    return { file: out, paths: found.map((p) => p.path) };
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

// Restore replaces the live save folders with the backup's; what's there now is backed up first.
// mapTo (a save made on another computer): (recorded paths) -> this computer's paths, same order.
export async function restoreSaves(gameDir, zip, { log = () => {}, mapTo = null } = {}) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "db-restore-"));
  try {
    await run(path7za(), ["x", "-y", "-bd", `-o${stage}`, zip], { maxBuffer: 16 * 1024 * 1024 });
    const m = JSON.parse(fs.readFileSync(path.join(stage, "decomp-buddy-saves.json"), "utf8"));
    const dests = mapTo ? mapTo(m.paths) : m.paths;
    await backupSaves(gameDir, dests.map((p) => ({ path: p.path, documented: p.documented })), { reason: "before-restore", log });
    m.paths.forEach((p, k) => {
      const src = path.join(stage, String(p.i), path.basename(p.path));
      const to = dests[k].path;
      fs.rmSync(to, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(src, to, { recursive: true });
    });
    log(`Restored saves from ${path.basename(zip)}`);
    return { restored: dests.map((p) => p.path) };
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}
