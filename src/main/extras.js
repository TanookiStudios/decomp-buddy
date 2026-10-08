// Export / Import Setup and local Stats.
import { ipcMain, dialog, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { buildExport, mergeImport } from "../setupfile.js";
import { readManifests } from "../installhtml.js";
import { readVault } from "../vault.js";
import { VERSION, vaultDir, loadSettings, saveSettings, libraryDirs, logTo } from "./core.js";

const libraryOf = (s) => libraryDirs(s).flatMap((dir) => readManifests(dir).map((m) => ({ dir, folder: m.folder, repo: m.repo, title: m.plan?.game_title, console: m.plan?.console, target: m.target || "windows", tag: m.release?.tag || null, status: m.status, setUpAt: m.setUpAt, files: (m.plan?.game_files || []).map((f) => ({ label: f.label, verification: f.verification?.status || null })) })));

ipcMain.handle("setupfile:export", async (e) => {
  const s = loadSettings();
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { title: "Export Setup", defaultPath: `Decomp Buddy Setup ${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
  if (r.canceled) return null;
  const out = buildExport(s, { version: VERSION, library: libraryOf(s), vault: readVault(vaultDir()).map(({ identity, md5, size, addedAt }) => ({ identity, md5, size, addedAt })) });
  fs.writeFileSync(r.filePath, JSON.stringify(out, null, 2));
  logTo(e.sender, `Exported setup to ${r.filePath}`);
  return { file: r.filePath, finds: out.settings.localFinds?.length || 0, games: out.library.length };
});
ipcMain.handle("setupfile:import", async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: "Import Setup", properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] });
  if (r.canceled) return null;
  const merged = mergeImport(loadSettings(), JSON.parse(fs.readFileSync(r.filePaths[0], "utf8")));
  merged.settings.libraryFolders = (merged.settings.libraryFolders || []).filter((d) => fs.existsSync(d)); // other machine's folders mean nothing here
  saveSettings(merged.settings);
  logTo(e.sender, `Imported setup from ${r.filePaths[0]}: ${JSON.stringify(merged.added)}`);
  return { added: merged.added, filled: merged.filled, otherMachineGames: merged.library.length };
});

ipcMain.handle("stats:get", () => {
  const s = loadSettings();
  const lib = libraryOf(s);
  const tally = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
  const files = lib.flatMap((g) => g.files);
  return {
    catalog: Object.entries(s.stats?.catalog || {}).sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
    plans: Object.entries(s.stats?.plans || {}).sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
    installs: { games: lib.length, byStatus: tally(lib.map((g) => g.status || "unknown")), byTarget: tally(lib.map((g) => g.target)) },
    verification: tally(files.map((f) => f.verification || "not checked")),
    finds: { pending: (s.localFinds || []).length, byVia: tally((s.localFinds || []).map((f) => f.via || "Before tracking")) },
    discover: { waiting: Object.keys(s.discovered || {}).length, dismissed: Object.keys(s.discoverDismissed || {}).length },
    setupCount: s.setupCount || 0,
  };
});
