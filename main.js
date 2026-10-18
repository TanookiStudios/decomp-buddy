import { app, nativeTheme } from "electron";
import path from "node:path";
import { loadSettings, backupSettingsOnUpgrade, githubToken, applyGitHubToken } from "./src/main/core.js";
// Portable Windows build (electron-builder sets this): keep settings beside the exe, not in AppData.
if (process.env.PORTABLE_EXECUTABLE_DIR) app.setPath("userData", path.join(process.env.PORTABLE_EXECUTABLE_DIR, "Decomp Buddy Data"));
// Each module registers its IPC handlers on import.
import "./src/main/settings.js";
import "./src/main/catalog.js";
import "./src/main/admin.js";
import "./src/main/plans.js";
import "./src/main/updater.js";
import "./src/main/setup.js";
import "./src/main/library.js";
import "./src/main/background.js";
import { sendStatsIfDue } from "./src/main/reports.js";
import "./src/main/mods.js";
import "./src/main/build.js";
import "./src/main/transfer.js";
import "./src/main/extras.js";
import "./src/main/files.js";
import "./src/main/installs.js";
import "./src/main/suggest.js";
import "./src/main/local.js";
import "./src/main/game.js";
import "./src/main/finding.js";
import "./src/main/look.js";
import "./src/main/devices.js";
import { createWindow } from "./src/main/window.js";
import { BrowserWindow } from "electron";
import { parseDeepLink } from "./src/deeplink.js";
import { playFromShortcut } from "./src/main/library.js";
import { startBackground, keepRunning } from "./src/main/background.js";

// "Open In Decomp Buddy" links from the website. Only the installed app claims the scheme - a dev or
// test run must never take over the system's handler.
let pendingLink = null;
function deliver(url) {
  const link = parseDeepLink(url); if (!link) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (link.play) { if (win) playFromShortcut(win, link); return; }
  if (!win) { pendingLink = link; return; }
  if (win.isMinimized()) win.restore(); win.show(); win.focus();
  const send = () => win.webContents.send("deeplink", link);
  win.webContents.isLoading() ? win.webContents.once("did-finish-load", send) : send();
}
app.on("open-url", (e, url) => { e.preventDefault(); app.isReady() ? deliver(url) : (pendingLink = parseDeepLink(url)); }); // macOS
if (app.isPackaged) {
  if (!app.requestSingleInstanceLock()) app.quit();
  app.on("second-instance", (_e, argv) => { const u = argv.find((a) => a.startsWith("decompbuddy://")); if (u) deliver(u); else BrowserWindow.getAllWindows()[0]?.focus(); }); // Windows/Linux
  app.setAsDefaultProtocolClient("decompbuddy");
  const first = process.argv.find((a) => a.startsWith("decompbuddy://")); if (first) pendingLink = parseDeepLink(first);
}

app.whenReady().then(() => { try { backupSettingsOnUpgrade(); } catch {} const s = loadSettings(); if (!process.env.GITHUB_TOKEN) applyGitHubToken(githubToken(s)); nativeTheme.themeSource = ["light", "dark"].includes(s.theme) ? s.theme : "system"; startBackground(); setTimeout(() => sendStatsIfDue(), 60_000); if (process.argv.includes("--background") && keepRunning()) return; const win = createWindow(); if (pendingLink) { const l = pendingLink; pendingLink = null; win.webContents.once("did-finish-load", () => (l.play ? playFromShortcut(win, l) : win.webContents.send("deeplink", l))); } });
// Keep Running In The Background (Settings → Updates): the window closes, the tray icon and Auto Update stay.
app.on("window-all-closed", () => { if (keepRunning()) { if (process.platform === "darwin") app.dock?.hide(); } else app.quit(); });
app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); if (process.platform === "darwin") app.dock?.show(); });
app.on("before-quit", () => { app.quitting = true; });
