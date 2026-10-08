// Game files: library index, DAT files, save backups, disc ripping.
import { app, ipcMain, dialog, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { scanLibrary, readIndex } from "../romindex.js";
import { addDat, listDats, removeDat } from "../dat.js";
import { savePathsFor, listBackups, backupSaves, restoreSaves } from "../saves.js";
import { detectDrives, rip } from "../dump.js";
import { fetchPublished, planKey } from "../plans.js";
import { upgradeManifest } from "../installhtml.js";
import { targetIsHost } from "../targets.js";
import { logTo, safeSend, loadSettings, saveSettings, plansFileFor, outDirFor, currentTarget, state } from "./core.js";

export const romIndexFile = () => path.join(app.getPath("userData"), "romindex.json");
export const datDir = () => path.join(app.getPath("userData"), "dats");

// ---- Game-file library
let scanState = null;
ipcMain.handle("romindex:status", () => {
  const idx = readIndex(romIndexFile()); const s = loadSettings();
  return { folders: s.romFolders || [], files: Object.keys(idx.files || {}).length, scannedAt: idx.scannedAt || null, scanning: !!scanState };
});
ipcMain.handle("romindex:folders", async (e, { add, remove } = {}) => {
  const s = loadSettings(); let folders = s.romFolders || [];
  if (add) { const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: "A folder with your game files", properties: ["openDirectory"] }); if (!r.canceled) folders = [...new Set([...folders, r.filePaths[0]])]; }
  if (remove) folders = folders.filter((f) => f !== remove);
  s.romFolders = folders; saveSettings(s); return folders;
});
export async function runScan(sender) {
  if (scanState) throw new Error("Already scanning.");
  const s = loadSettings(); if (!(s.romFolders || []).length) throw new Error("Add a folder first.");
  scanState = { cancelled: false };
  logTo(sender, `--- Scanning game-file folders: ${s.romFolders.join(", ")}`);
  try {
    const r = await scanLibrary(s.romFolders, romIndexFile(), { state: scanState, onProgress: (p) => safeSend(sender, "romindex:progress", p) });
    logTo(sender, `Library: ${r.total} file(s), ${r.hashed} newly fingerprinted${r.cancelled ? " (cancelled)" : ""}.`);
    return r;
  } finally { scanState = null; }
}
ipcMain.handle("romindex:scan", (e) => runScan(e.sender));
ipcMain.handle("romindex:cancel", () => { if (scanState) scanState.cancelled = true; return true; });

// ---- DAT files
ipcMain.handle("dat:list", () => listDats(datDir()));
ipcMain.handle("dat:add", async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: "A No-Intro or Redump DAT file", properties: ["openFile", "multiSelections"], filters: [{ name: "DAT", extensions: ["dat", "xml"] }, { name: "All Files", extensions: ["*"] }] });
  if (r.canceled) return [];
  return r.filePaths.map((f) => { try { return addDat(datDir(), f); } catch (err) { return { error: `${path.basename(f)}: ${err.message}` }; } });
});
ipcMain.handle("dat:remove", (_e, { id }) => { removeDat(datDir(), id); return true; });

// ---- Saves
async function factsFor(repo) {
  const pub = await fetchPublished({ file: plansFileFor(loadSettings()), cacheDir: app.getPath("userData") }).catch(() => null);
  return pub?.plans?.[planKey("github", ...String(repo).split("/"))]?.facts || null;
}
const manifestAt = (folder) => upgradeManifest(JSON.parse(fs.readFileSync(path.join(folder, "decomp-buddy.json"), "utf8")));
export async function savesOf(folder) {
  const m = manifestAt(folder);
  const facts = await factsFor(m.repo);
  const here = targetIsHost(m.target || "windows");
  return { here, documented: (facts?.save_paths || []).map((p) => `${p.platform}: ${p.path}`), paths: here ? savePathsFor(facts, { gameDir: folder }) : [] };
}
ipcMain.handle("saves:info", async (_e, { folder }) => {
  const s = await savesOf(folder);
  return { ...s, paths: s.paths.map((p) => ({ ...p, exists: fs.existsSync(p.path) })), backups: listBackups(folder) };
});
ipcMain.handle("saves:backup", async (e, { folder }) => { const s = await savesOf(folder); const r = await backupSaves(folder, s.paths, { log: (m) => logTo(e.sender, m) }); if (!r) throw new Error("No save files found in the documented locations yet."); return r; });
ipcMain.handle("saves:restore", (e, { folder, file }) => {
  if (!path.resolve(file).startsWith(path.resolve(folder) + path.sep)) throw new Error("That backup isn't in this game's folder.");
  return restoreSaves(folder, file, { log: (m) => logTo(e.sender, m) });
});

// ---- Disc ripping
let ripState = null;
ipcMain.handle("dump:drives", () => detectDrives());
ipcMain.handle("dump:rip", async (e, { id, i }) => {
  const it = state.pending.get(id); if (!it) throw new Error("Read the repos again - the analysis is stale.");
  if (ripState) throw new Error("Already ripping a disc.");
  const drive = (await detectDrives())[0];
  const s = loadSettings();
  const outDir = path.join(outDirFor(s, currentTarget(s)), ".decomp-buddy-staging", `${Date.now()}-rip`);
  ripState = { cancelled: false };
  try { return await rip({ consoleName: it.plan.console, drive, outDir, name: `${it.plan.game_title} ${it.plan.game_files[i]?.label || ""}`.trim(), log: (m) => logTo(e.sender, m), state: ripState }); }
  finally { ripState = null; }
});
ipcMain.handle("dump:cancel", () => { if (ripState) { ripState.cancelled = true; try { ripState.child?.kill("SIGTERM"); } catch {} } return true; });
