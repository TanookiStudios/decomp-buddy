// Moved out of main.js unchanged (2026-09-23): updater IPC handlers.
import { app, ipcMain } from "electron";
import { checkForUpdate, UPDATE_URL } from "../updates.js";
import { VERSION, logTo, loadSettings } from "./core.js";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;

// Two update paths: electron-updater (downloads + installs, needs the latest*.yml next to the
// installers) and the plain latest.json banner as fallback when the yml isn't published.
let updaterState = { status: "idle" };
export function setupAutoUpdater(win) {
  // A Flatpak updates through Flatpak (Discover on a Steam Deck); replacing its files isn't allowed there.
  if (!app.isPackaged || process.env.DECOMP_FLATPAK || process.env.FLATPAK_ID) return;
  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = !process.env.DECOMP_UPDATE_NOINSTALL; autoUpdater.allowPrerelease = false;
  autoUpdater.logger = { info: (m) => logTo(null, `updater: ${m}`), warn: (m) => logTo(null, `updater: ${m}`), error: (m) => logTo(null, `updater: ${m}`), debug: () => {} };
  if (process.env.DECOMP_UPDATE_FEED) autoUpdater.setFeedURL({ provider: "generic", url: process.env.DECOMP_UPDATE_FEED });
  const send = (st) => { updaterState = st; logTo(null, `updater: ${st.status}${st.version ? " " + st.version : ""}${st.message ? " " + st.message : ""}`); if (win && !win.isDestroyed()) win.webContents.send("updater", st); };
  autoUpdater.on("checking-for-update", () => send({ status: "checking" }));
  autoUpdater.on("update-available", (i) => send({ status: "downloading", version: i.version }));
  autoUpdater.on("update-not-available", () => send({ status: "current" }));
  autoUpdater.on("download-progress", (p) => send({ status: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (i) => send({ status: "ready", version: i.version, notes: typeof i.releaseNotes === "string" ? i.releaseNotes : "" }));
  // The raw updater error is for the log; people get one plain line (the full text is in Open Log).
  autoUpdater.on("error", (err) => {
    const raw = String(err?.message || err);
    const message = /\b404\b|Cannot find channel/i.test(raw) ? "The update server doesn't have this version's update file yet - you'll still get a banner when a new version is out."
      : /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|net::ERR/i.test(raw) ? "Couldn't reach the update server - it'll try again later."
      : /signature|code sign|checksum|sha512/i.test(raw) ? "An update downloaded but didn't pass its signature check, so it wasn't installed."
      : "Automatic update didn't work this time - details are in the log.";
    logTo(null, `updater error (full): ${raw}`);
    send({ status: "error", message });
  });
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 3600 * 1000);
}
ipcMain.handle("update:check", async () => {
  if (app.isPackaged) { try { await autoUpdater.checkForUpdates(); } catch {} }
  const s = loadSettings();
  return checkForUpdate(VERSION, { url: process.env.DECOMP_UPDATE_URL || UPDATE_URL, target: process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : process.arch === "arm64" ? "macos-arm64" : "macos-x64" });
});
ipcMain.handle("update:state", () => updaterState);
ipcMain.handle("update:install", () => { autoUpdater.quitAndInstall(false, true); return true; });
