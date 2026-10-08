// Per-game tools on an installed copy: launch options, disk use + Free Up Space, adopting a folder
// set up by hand, Check Game, and save sync through a cloud folder.
import { app, ipcMain, dialog, shell, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { folderUsage, detectTarget, adoptManifest, checkFolder } from "../gametools.js";
import { cloudCandidates, gameKey, listCloud, pushToCloud, newerFromElsewhere, mapSavePaths } from "../savesync.js";
import { backupSaves, restoreSaves } from "../saves.js";
import { verifyPick } from "../verify.js";
import { checkRuntimes, installRuntimes, RUNTIMES } from "../winruntimes.js";
import { download, freeBytes } from "../setup.js";
import { makePack, packSize } from "../offlinepack.js";
import { applyPatchFile, patchedName, describePatch } from "../patch.js";
import { UPDATE_URL } from "../updates.js";
import { readManifests, upgradeManifest, writeInstallHtml } from "../installhtml.js";
import { targetIsHost } from "../targets.js";
import { findExecutable } from "./library.js";
import { savesOf } from "./files.js";
import { logTo, loadSettings, saveSettings, libraryDirs, state } from "./core.js";

const MANIFEST = "decomp-buddy.json";
export const readM = (folder) => upgradeManifest(JSON.parse(fs.readFileSync(path.join(folder, MANIFEST), "utf8")));
export const stamp = (folder, patch) => { const m = readM(folder); Object.assign(m, patch); fs.writeFileSync(path.join(folder, MANIFEST), JSON.stringify(m, null, 2)); return m; };
// Only folders the Library shows can be touched from here.
export function libraryFolder(folder) {
  const f = path.resolve(String(folder || ""));
  if (!libraryDirs(loadSettings()).some((d) => path.dirname(f) === path.resolve(d)) || !fs.existsSync(path.join(f, MANIFEST))) throw new Error("That isn't one of your installed games.");
  return f;
}

// ---- Launch options
ipcMain.handle("game:options", (_e, { folder }) => { const m = readM(libraryFolder(folder)); return { launchArgs: m.launchArgs || "" }; });
ipcMain.handle("game:setOptions", (_e, { folder, launchArgs }) => { stamp(libraryFolder(folder), { launchArgs: String(launchArgs || "").slice(0, 500).trim() }); return true; });

// ---- Disk use + Free Up Space (to the Trash, never a hard delete)
ipcMain.handle("game:usage", (_e, { folder }) => folderUsage(libraryFolder(folder)));
ipcMain.handle("game:reclaim", async (e, { folder, kinds }) => {
  const f = libraryFolder(folder);
  const u = folderUsage(f); let freed = 0; const failed = [];
  for (const r of u.reclaim.filter((x) => kinds.includes(x.kind))) {
    for (const p of r.paths) {
      if (!path.resolve(p).startsWith(f + path.sep)) continue;
      try { await shell.trashItem(p); } catch (err) { failed.push(`${path.basename(p)}: ${err.message}`); continue; }
    }
    freed += r.bytes;
  }
  logTo(e.sender, `Free Up Space (${path.basename(f)}): moved ${kinds.join(", ")} to the Trash${failed.length ? `; couldn't move ${failed.join("; ")}` : ""}.`);
  return { freed, failed };
});

// ---- Adopt a folder someone set up by hand
const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function guesses(folder) {
  const words = new Set(norm(path.basename(folder)).split(" ").filter((w) => w.length > 1));
  const exe = findExecutable(folder, null); if (exe) for (const w of norm(path.basename(exe).replace(/\.(exe|app)$/i, "")).split(" ")) if (w.length > 1) words.add(w);
  const score = (g) => { const t = new Set(norm(`${g.title} ${g.repo} ${g.project || ""}`).split(" ")); let n = 0; for (const w of words) if (t.has(w)) n++; return n; };
  return state.catalogGames.filter((g) => g.owner).map((g) => ({ g, n: score(g) })).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 8)
    .map(({ g }) => ({ id: g.id, title: g.title, console: g.console, repo: `${g.owner}/${g.repo}` }));
}
ipcMain.handle("game:adoptPick", async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: "A game folder you set up yourself", properties: ["openDirectory"] });
  if (r.canceled) return null;
  const folder = r.filePaths[0];
  if (fs.existsSync(path.join(folder, MANIFEST))) throw new Error("Decomp Buddy already knows this folder - it's in Installed Games (add its parent under Settings → Library Folders if it isn't showing).");
  return { folder, target: detectTarget(folder), guesses: guesses(folder) };
});
ipcMain.handle("game:adopt", (e, { folder, gameId, target }) => {
  const g = state.catalogGames.find((x) => x.id === gameId); if (!g) throw new Error("Pick the game this folder holds.");
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error("That folder is gone.");
  if (fs.existsSync(path.join(folder, MANIFEST))) throw new Error("This folder is already adopted.");
  const exe = findExecutable(folder, null);
  const m = adoptManifest({ folderName: path.basename(folder), game: g, target, executable: exe ? path.basename(exe) : null });
  fs.writeFileSync(path.join(folder, MANIFEST), JSON.stringify(m, null, 2));
  // The Library scans its folders one level deep: make sure this folder's parent is one of them.
  const s = loadSettings(); const parent = path.dirname(folder);
  if (!libraryDirs(s).some((d) => path.resolve(d) === path.resolve(parent))) { s.libraryFolders = [...new Set([...(s.libraryFolders || []), parent])]; saveSettings(s); }
  try { writeInstallHtml(parent); } catch {}
  logTo(e.sender, `Adopted ${folder} as ${g.title} (${target}). Update brings it to the latest release and tracks the version from then on.`);
  return { title: g.title };
});

// ---- Check Game: files still there, game files still the right ones, the program findable.
ipcMain.handle("game:check", async (e, { folder }) => {
  const f = libraryFolder(folder); const m = readM(f);
  const log = (x) => logTo(e.sender, x);
  const r = checkFolder(f, m);
  const verified = [];
  for (const p of r.placed) {
    if (!p.exists) { verified.push({ ...p, status: "missing", summary: "Missing - put the file back or run Update to place it again." }); continue; }
    const spec = m.plan.game_files[p.i];
    try { const v = await verifyPick(p.path, spec, { log }); verified.push({ ...p, status: v.status, summary: v.summary }); }
    catch (err) { verified.push({ ...p, status: "unverified", summary: err.message }); }
  }
  const exe = findExecutable(f, m.plan?.build?.executable);
  const runtimes = process.platform === "win32" && (m.target || "windows") === "windows" ? await checkRuntimes(f).catch(() => null) : null;
  const problems = r.missing.length + verified.filter((v) => v.status === "missing" || v.status === "mismatch").length + (exe ? 0 : 1) + (runtimes?.missing?.length || 0);
  log(`Check ${m.plan?.game_title}: ${problems ? `${problems} problem(s)` : "all good"}.`);
  return { missingFiles: r.missing, placed: verified, needed: r.needed, exe: exe ? path.relative(f, exe) : null, runtimes, adopted: !!m.adopted, tag: m.release?.tag || null, problems };
});

// ---- Save sync through a cloud folder
const MACHINE = () => { const s = loadSettings(); if (!s.deviceId) { s.deviceId = crypto.randomBytes(2).toString("hex"); saveSettings(s); } return `${process.platform === "darwin" ? "Mac" : process.platform === "win32" ? "PC" : "Linux"}-${s.deviceId}`; };
const keyOf = (m) => gameKey(m.repo, m.plan?.game_title);
ipcMain.handle("sync:status", () => { const s = loadSettings(); return { dir: s.syncDir || null, candidates: cloudCandidates(), machine: MACHINE() }; });
ipcMain.handle("sync:set", async (e, { dir, choose, off } = {}) => {
  const s = loadSettings();
  if (off) s.syncDir = null;
  else if (choose) { const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: "A folder your cloud drive syncs", properties: ["openDirectory", "createDirectory"] }); if (r.canceled) return s.syncDir || null; s.syncDir = r.filePaths[0]; }
  else if (dir && fs.existsSync(dir)) s.syncDir = dir;
  saveSettings(s); return s.syncDir || null;
});
// Back the saves up and copy that backup into the sync folder.
export async function pushSaves(folder, { reason = "sync", log = () => {} } = {}) {
  const s = loadSettings(); if (!s.syncDir) return null;
  const m = readM(folder); if (!targetIsHost(m.target || "windows")) return null;
  const sv = await savesOf(folder); if (!sv.paths.length) return null;
  const b = await backupSaves(folder, sv.paths, { reason, log }); if (!b) return null;
  const up = pushToCloud(b.file, s.syncDir, keyOf(m), { machine: MACHINE() });
  stamp(folder, { saveSync: { at: new Date().toISOString(), pushed: path.basename(up) } });
  log(`Saves copied to your sync folder: ${path.basename(up)}`);
  return up;
}
ipcMain.handle("sync:push", async (e, { folder }) => { const f = libraryFolder(folder); const up = await pushSaves(f, { log: (x) => logTo(e.sender, x) }); if (!up) throw new Error("Nothing to sync - no sync folder set, or no save files in the documented folders yet."); return { file: path.basename(up) }; });
// Every installed game (playable here) with a newer save made on another computer.
ipcMain.handle("sync:check", async () => {
  const s = loadSettings(); if (!s.syncDir || !fs.existsSync(s.syncDir)) return [];
  const out = [];
  for (const dir of libraryDirs(s)) for (const m of readManifests(dir)) {
    if (!targetIsHost(m.target || "windows")) continue;
    const other = newerFromElsewhere(s.syncDir, keyOf(m), { machine: MACHINE(), since: m.saveSync?.at || null });
    if (other) out.push({ folder: path.join(dir, m.folder), title: m.plan?.game_title || m.folder, at: other.at, machine: other.machine, file: other.file });
  }
  return out;
});
ipcMain.handle("sync:pull", async (e, { folder, file }) => {
  const f = libraryFolder(folder); const s = loadSettings(); const m = readM(f);
  const ok = listCloud(s.syncDir, keyOf(m)).find((c) => c.file === file); if (!ok) throw new Error("That save isn't in the sync folder any more.");
  const sv = await savesOf(f);
  const r = await restoreSaves(f, file, { log: (x) => logTo(e.sender, x), mapTo: (rec) => mapSavePaths(rec, sv.paths) });
  // "Seen up to" is the pulled save's own time when that's later (clocks differ between computers).
  const now = new Date().toISOString();
  stamp(f, { saveSync: { at: ok.at && ok.at > now ? ok.at : now, pulled: path.basename(file) } });
  return r;
});
ipcMain.handle("sync:list", (_e, { folder }) => { const s = loadSettings(); if (!s.syncDir) return []; const m = readM(libraryFolder(folder)); return listCloud(s.syncDir, keyOf(m)).map(({ name, at, machine, file }) => ({ name, at, machine, file })); });

// ---- Windows runtimes (Check Game → Fix Windows Runtimes, and after a set-up on the PC)
ipcMain.handle("runtimes:fix", async (e, { folder } = {}) => {
  if (process.platform !== "win32") throw new Error("Runtimes are installed on the Windows PC that plays the game.");
  const st = await checkRuntimes(folder ? libraryFolder(folder) : null);
  const ids = (st?.missing || []).map((x) => x.id).filter((id) => RUNTIMES[id]);
  if (!ids.length) return { installed: [], failed: [] };
  return installRuntimes(ids, { download, log: (x) => logTo(e.sender, x) });
});

// ---- Offline Pack: chosen games (+ runtimes, + Decomp Buddy for Windows) into one folder on any drive.
ipcMain.handle("pack:size", (_e, { folders }) => packSize(folders.map(libraryFolder)));
ipcMain.handle("pack:make", async (e, { folders, includeApp, includeRuntimes }) => {
  const fs2 = folders.map(libraryFolder); if (!fs2.length) throw new Error("Tick at least one game.");
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: "Where should the Offline Pack go? (an SD card or USB stick is fine)", properties: ["openDirectory", "createDirectory"] });
  if (r.canceled) return null;
  const dest = r.filePaths[0];
  const need = packSize(fs2) + (includeApp ? 130e6 : 0) + (includeRuntimes ? 200e6 : 0);
  const free = freeBytes(dest);
  if (free !== null && need > free) throw new Error(`Not enough room there: the pack needs about ${(need / 1e9).toFixed(1)} GB and ${(free / 1e9).toFixed(1)} GB is free.`);
  const log = (x) => logTo(e.sender, x);
  const fetchJson = async (url) => { const res = await fetch(process.env.DECOMP_UPDATE_URL || url, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(20_000) }); if (!res.ok) throw new Error(`${url} answered ${res.status}`); return res.json(); };
  const out = await makePack({ folders: fs2, destRoot: dest, includeApp, includeRuntimes, download, fetchJson, log, latestUrl: UPDATE_URL });
  log(`Offline Pack ready: ${out.dir}`);
  return out;
});

// ---- ROM patches (IPS / BPS / UPS / PPF / APS / xdelta). The original is never changed.
const PATCH_FILTERS = [{ name: "Patch", extensions: ["ips", "bps", "ups", "ppf", "aps", "rup", "bdf", "xdelta", "vcdiff", "delta"] }, { name: "All Files", extensions: ["*"] }];
ipcMain.handle("patch:standalone", async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const rom = await dialog.showOpenDialog(win, { title: "The ROM to patch (it isn't changed - a patched copy is made beside it)", properties: ["openFile"] });
  if (rom.canceled) return null;
  const p = await dialog.showOpenDialog(win, { title: "The patch", properties: ["openFile"], filters: PATCH_FILTERS });
  if (p.canceled) return null;
  const r = applyPatchFile(rom.filePaths[0], p.filePaths[0], patchedName(rom.filePaths[0]));
  logTo(e.sender, `Patched: ${r.out} (${describePatch(r, p.filePaths[0])})`);
  return { out: r.out, summary: describePatch(r, p.filePaths[0]) };
});
// Set Up: patch the file picked for a game-file row, into staging, then verify the result for that row.
ipcMain.handle("patch:pick", async (e, { path: file, gameFile, outDir }) => {
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) throw new Error("Choose the game file first, then patch it.");
  const p = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: `Patch for ${gameFile?.label || "this file"}`, properties: ["openFile"], filters: PATCH_FILTERS });
  if (p.canceled) return null;
  const s = loadSettings();
  const { outDirFor, currentTarget } = await import("./core.js");
  const stage = path.join(outDir || outDirFor(s, currentTarget(s)), ".decomp-buddy-staging", `${Date.now()}-patch`);
  const r = applyPatchFile(file, p.filePaths[0], patchedName(file, stage));
  const v = await verifyPick(r.out, gameFile, { log: (x) => logTo(e.sender, x) });
  return { ...v, resolvedPath: r.out, summary: `${path.basename(r.out)} (${describePatch(r, p.filePaths[0])}) - ${v.summary}` };
});
