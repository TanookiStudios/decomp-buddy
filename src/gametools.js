// Per-game tools that work on a set-up folder: launch arguments, disk use and what "Free Up Space"
// may take, adopting a folder someone set up by hand, and checking a copy is still whole.

import fs from "node:fs";
import path from "node:path";
import { VERSIONS, listVersions } from "./versions.js";
import { BACKUP_DIR, listBackups } from "./saves.js";

// "-fullscreen --res 1920x1080 --name \"My Save\"" -> ["-fullscreen", "--res", "1920x1080", "--name", "My Save"]
export function splitArgs(s) {
  const out = []; let cur = "", q = null, has = false;
  for (const c of String(s || "")) {
    if (q) { if (c === q) q = null; else cur += c; continue; }
    if (c === '"' || c === "'") { q = c; has = true; continue; }
    if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ""; has = false; continue; }
    cur += c;
  }
  if (cur || has) out.push(cur);
  return out;
}

// How to start one executable with arguments. wait: the returned process lives as long as the game
// (macOS `open -W`), so "the game closed" can trigger a save sync.
export function launchSpec(exe, { platform = process.platform, args = [], wait = false } = {}) {
  if (platform === "darwin" && /\.app$/i.test(exe)) return { cmd: "open", argv: [...(wait ? ["-W"] : []), "-a", exe, ...(args.length ? ["--args", ...args] : [])], opts: {} };
  // .bat needs cmd.exe; an .exe gets its arguments as-is (no shell re-parsing them).
  return { cmd: exe, argv: args, opts: { cwd: path.dirname(exe), shell: platform === "win32" && /\.(bat|cmd)$/i.test(exe) } };
}

// The game's program in an installed folder: the plan's hint first, then the shallowest program that isn't a launcher/setup/uninstaller.
export function findExecutable(dir, hint, platform = process.platform) {
  const want = hint ? String(hint).toLowerCase() : null;
  const walk = (d, depth = 0, out = []) => { if (depth > 3) return out; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (/\.app$/i.test(e.name)) out.push(p); else if (!/^(Source|Game Files|Mods|node_modules|\.)/.test(e.name)) walk(p, depth + 1, out); } else out.push(p); } return out; };
  const files = walk(dir);
  const isExe = (p) => platform === "win32" ? /\.(exe|bat)$/i.test(p) : platform === "darwin" ? /\.app$/i.test(p) || (() => { try { fs.accessSync(p, fs.constants.X_OK); return !/\.(sh|py|txt|json|ini|ico|png|jpg|dll|dylib|so|md|bin|cue|iso)$/i.test(p) && fs.statSync(p).size > 10_000; } catch { return false; } })() : (() => { try { fs.accessSync(p, fs.constants.X_OK); return !/\.(sh|py|txt|json|ini|png|jpg|dll|so|md|bin|cue|iso)$/i.test(p) && !fs.statSync(p).isDirectory(); } catch { return false; } })();
  const exes = files.filter(isExe);
  if (want) { const hit = exes.find((p) => path.basename(p).toLowerCase() === want) || exes.find((p) => path.basename(p).toLowerCase().startsWith(want.replace(/\.(exe|app)$/, ""))); if (hit) return hit; }
  // prefer top level, then shortest path, then non-launcher names
  return exes.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length || (/launcher|setup|uninstall|rexiso|crash/i.test(path.basename(a)) ? 1 : 0) - (/launcher|setup|uninstall|rexiso|crash/i.test(path.basename(b)) ? 1 : 0))[0] || null;
}

// A desktop shortcut for an installed game. Straight to its program when it runs natively; through Decomp Buddy
// (a decompbuddy://play link) when it needs Wine or Proton. Returns what to write - the caller writes it.
const safeName = (t) => String(t || "Game").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Game";
const winArg = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const desktopArg = (a) => `"${String(a).replace(/["`$\\]/g, "\\$&")}"`; // freedesktop Exec quoting
const xml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function shortcutFor({ platform = process.platform, desktop, title, exe, args = [], icon = null, link = null }) {
  const name = safeName(title);
  if (link) {
    if (platform === "win32") return { kind: "text", file: path.join(desktop, `${name}.url`), text: `[InternetShortcut]\r\nURL=${link}\r\n${icon ? `IconFile=${icon}\r\nIconIndex=0\r\n` : ""}` };
    if (platform === "darwin") return { kind: "text", file: path.join(desktop, `${name}.webloc`), text: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>${xml(link)}</string></dict></plist>\n` };
    return { kind: "text", mode: 0o755, file: path.join(desktop, `${name}.desktop`), text: `[Desktop Entry]\nType=Application\nName=${name}\nExec=xdg-open ${desktopArg(link)}\n${icon ? `Icon=${icon}\n` : ""}Terminal=false\n` };
  }
  if (platform === "win32") return { kind: "lnk", file: path.join(desktop, `${name}.lnk`), target: exe, cwd: path.dirname(exe), args: args.map(winArg).join(" "), icon: icon || exe };
  if (platform === "darwin") {
    if (/\.app$/i.test(exe) && !args.length) return { kind: "symlink", file: path.join(desktop, name), target: exe };
    return { kind: "text", mode: 0o755, file: path.join(desktop, `${name}.command`), text: `#!/bin/sh\ncd ${desktopArg(path.dirname(exe))} || exit 1\nexec ${/\.app$/i.test(exe) ? `open -a ${desktopArg(exe)}${args.length ? ` --args ${args.map(desktopArg).join(" ")}` : ""}` : [exe, ...args].map(desktopArg).join(" ")}\n` };
  }
  return { kind: "text", mode: 0o755, file: path.join(desktop, `${name}.desktop`), text: `[Desktop Entry]\nType=Application\nName=${name}\nExec=${[exe, ...args].map(desktopArg).join(" ")}\nPath=${path.dirname(exe)}\n${icon ? `Icon=${icon}\n` : ""}Terminal=false\n` };
}

// Bytes under a path; symlinks are counted as themselves, never followed.
export function dirSize(p) {
  let st; try { st = fs.lstatSync(p); } catch { return 0; }
  if (!st.isDirectory()) return st.size;
  let n = 0; for (const e of fs.readdirSync(p)) n += dirSize(path.join(p, e));
  return n;
}

const MODS = "Decomp Buddy Mods";
const ARCHIVE = /\.(zip|7z|rar)$/i;
// What a game folder uses, and what can go without touching the game, its files, saves or mods.
export function folderUsage(folder, { keepBackups = 3 } = {}) {
  const total = dirSize(folder);
  const reclaim = [];
  const versions = listVersions(folder);
  if (versions.length) reclaim.push({ kind: "versions", label: `Old Versions (${versions.map((v) => v.tag).join(", ")})`, why: "Roll Back stops working for these.", paths: versions.map((v) => v.dir) });
  const backups = listBackups(folder).slice(keepBackups);
  if (backups.length) reclaim.push({ kind: "saveBackups", label: `Older Save Backups (${backups.length})`, why: `The newest ${keepBackups} are kept.`, paths: backups.map((b) => b.file) });
  // A pack archive whose unpacked copy is right beside it is a duplicate.
  const dl = path.join(folder, MODS, "downloads");
  const packs = fs.existsSync(dl) ? fs.readdirSync(dl).filter((n) => ARCHIVE.test(n) && fs.existsSync(path.join(dl, n.replace(ARCHIVE, "")))).map((n) => path.join(dl, n)) : [];
  if (packs.length) reclaim.push({ kind: "modArchives", label: `Mod Downloads Already Unpacked (${packs.length})`, why: "The unpacked copies stay.", paths: packs });
  const leftovers = [".decomp-buddy-nightly"].map((n) => path.join(folder, n)).filter((p) => fs.existsSync(p));
  if (leftovers.length) reclaim.push({ kind: "leftovers", label: "Leftover Download Scraps", why: "From an interrupted download.", paths: leftovers });
  for (const r of reclaim) r.bytes = r.paths.reduce((n, p) => n + dirSize(p), 0);
  return {
    total, reclaimable: reclaim.reduce((n, r) => n + r.bytes, 0), reclaim,
    parts: { versions: dirSize(path.join(folder, VERSIONS)), saveBackups: dirSize(path.join(folder, BACKUP_DIR)), mods: dirSize(path.join(folder, MODS)) },
  };
}

const walk = (d, depth, out) => {
  if (depth > 3) return out;
  let entries = []; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (/\.app$/i.test(e.name)) out.push(p); else if (!/^(Versions|Saves Backup|Decomp Buddy Mods|Game Files|Source)$/.test(e.name)) walk(p, depth + 1, out); }
    else out.push(p);
  }
  return out;
};
const isElf = (p) => { try { const fd = fs.openSync(p, "r"); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd); return b.toString("latin1") === "\x7fELF"; } catch { return false; } };
// Which computer a hand-made folder is for, from what's in it.
export function detectTarget(folder) {
  const files = walk(folder, 0, []);
  if (files.some((f) => /\.exe$/i.test(f) && !/unins|setup|vc_?redist|dxsetup/i.test(path.basename(f)))) return "windows";
  if (files.some((f) => /\.app$/i.test(f))) return "macos-arm64";
  if (files.some((f) => !path.extname(f) && fs.statSync(f).size > 100_000 && isElf(f))) return "linux";
  return null;
}

// The smallest manifest that makes a hand-made folder a first-class Library game: Play, Update,
// Check, Saves and Mods all work from it. The version is unknown until the first update.
export function adoptManifest({ folderName, game, target, executable = null, now = new Date().toISOString() }) {
  return {
    decompBuddyVersion: 1, setUpAt: now, adopted: now, target,
    repo: `${game.owner}/${game.repo}`, repoUrl: game.repoUrl,
    release: { tag: null, url: null, files: [] }, downloadVerified: null, previousTag: null,
    folder: folderName, status: "ready", statusDetail: "Adopted from a folder set up outside Decomp Buddy.",
    plan: { game_title: game.gameTitle || game.title, console: game.console || "", build: { method: "release", executable }, game_files: [], notes: [] },
  };
}

// Is this copy whole? Release files present, game files still where they were placed.
export function checkFolder(folder, m) {
  const missing = (m.release?.files || []).filter((f) => !fs.existsSync(path.join(folder, f)));
  const placed = (m.plan?.game_files || []).filter((f) => f.placed).map((f, i) => {
    const p = path.join(folder, f.drop_into || "Game Files", f.placed.name);
    const exists = fs.existsSync(p);
    return { i, label: f.label, path: p, exists, sizeOk: exists && (!f.placed.bytes || dirSize(p) === f.placed.bytes || fs.statSync(p).isDirectory()) };
  });
  return { missing, placed, needed: (m.plan?.game_files || []).filter((f) => !f.placed).map((f) => f.label) };
}
