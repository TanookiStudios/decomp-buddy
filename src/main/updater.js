// Moved out of main.js unchanged (2026-09-23): updater IPC handlers.
import { app, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkForUpdate, updateFailed, UPDATE_URL } from "../updates.js";
import { VERSION, logTo, loadSettings, saveSettings } from "./core.js";
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
  // A downloaded update that didn't install last time won't install this time either: say so and point at the download,
  // instead of "Restart To Update" forever (a player's report, 17 Nov 2026). The Mac installer's own log goes into ours.
  const s0 = loadSettings(), failed = updateFailed(s0.updateDownloaded, VERSION) ? s0.updateDownloaded : null;
  if (s0.updateDownloaded && !failed) { delete s0.updateDownloaded; saveSettings(s0); }
  if (failed) {
    logTo(null, `updater: ${failed} was downloaded but this copy is still ${VERSION} - it didn't install`);
    try { logTo(null, `updater: Mac installer log: ${fs.readFileSync(path.join(os.homedir(), "Library/Caches/com.tanookistudios.decompbuddy.ShipIt/ShipIt_stderr.log"), "utf8").slice(-1500)}`); } catch {}
    setTimeout(() => send({ status: "failed", version: failed }), 4000);
  }
  autoUpdater.on("update-downloaded", (i) => {
    if (i.version === failed) return send({ status: "failed", version: i.version });
    const s = loadSettings(); s.updateDownloaded = i.version; saveSettings(s);
    send({ status: "ready", version: i.version, notes: typeof i.releaseNotes === "string" ? i.releaseNotes : "" });
  });
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
const inFlatpak = () => !!(process.env.DECOMP_FLATPAK || process.env.FLATPAK_ID);
ipcMain.handle("update:check", async () => {
  if (app.isPackaged && !inFlatpak()) { try { await autoUpdater.checkForUpdates(); } catch {} }
  const r = await checkForUpdate(VERSION, { url: process.env.DECOMP_UPDATE_URL || UPDATE_URL, target: process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : process.arch === "arm64" ? "macos-arm64" : "macos-x64" });
  // There's no Flatpak repository to update from, so the banner sends Flatpak (Steam Deck) users to the newest .flatpak.
  return inFlatpak() ? { ...r, url: "https://decompbuddy.com/download#steam-deck" } : r;
});
ipcMain.handle("update:state", () => updaterState);
// app.quitting first: with Run In Background on, closing the windows would otherwise just hide the app, and the
// update never installs (window-all-closed fires before before-quit).
ipcMain.handle("update:install", () => { app.quitting = true; autoUpdater.quitAndInstall(false, true); return true; });
