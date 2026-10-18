// Auto Update: checks installed games on a schedule (Settings → Updates) and installs the ones you let it, even
// with the window closed when Keep Running In The Background is on (an icon in the menu bar / system tray).
import { app, ipcMain, Tray, Menu, Notification, nativeImage, powerMonitor, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { readManifests } from "../installhtml.js";
import { updatesFor } from "../updates.js";
import { loadCatalog } from "./catalog.js";
import { updateInstalled } from "./setup.js";
import { runningGames } from "./library.js";
import { loadSettings, libraryDirs, logTo, here, state } from "./core.js";

export const SCHEDULES = { off: 0, "15m": 15 * 60e3, "1h": 3600e3, "6h": 6 * 3600e3, daily: 24 * 3600e3 };
let timer = null, tray = null, last = null, lastFound = 0;
const log = (m) => { const w = BrowserWindow.getAllWindows()[0]; if (w) logTo(w.webContents, m); };
const notify = (title, body) => { if (!process.env.DECOMP_HEADLESS && Notification.isSupported()) new Notification({ title, body, silent: true }).show(); };

export async function checkNow({ install = true } = {}) {
  if (state.busy) return last; // a set-up is running; try at the next tick
  const s = loadSettings();
  const installed = libraryDirs(s).flatMap((dir) => readManifests(dir).map((m) => ({ folder: path.join(dir, m.folder), manifest: m })));
  const { games } = await loadCatalog({ refresh: true });
  const found = updatesFor(installed, games, { autoDefault: !!s.autoUpdateAll });
  // Only files that passed the malware scan update by themselves; anything else waits for you to press Update.
  const go = install ? found.filter((u) => u.auto && u.scanned && !runningGames.has(u.folder)) : [];
  const done = go.length ? await updateInstalled(go, { log }) : [];
  const ok = done.filter((r) => r.ok);
  last = { at: new Date().toISOString(), found: found.length, installed: ok.map((r) => path.basename(r.folder)), failed: done.filter((r) => !r.ok).map((r) => `${path.basename(r.folder)}: ${r.error}`) };
  if (ok.length) notify("Games Updated", ok.length === 1 ? `${path.basename(ok[0].folder)} is up to date.` : `${ok.length} games are up to date.`);
  else if (found.length - go.length > 0 && found.length !== lastFound) notify("Updates Ready", `${found.length} game${found.length === 1 ? " has an update" : "s have updates"} in Decomp Buddy.`);
  lastFound = found.length;
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("autoupdate:done", last);
  return last;
}

export function applySchedule() {
  clearInterval(timer); timer = null;
  const every = SCHEDULES[loadSettings().updateSchedule] || 0;
  if (every) timer = setInterval(() => checkNow().catch((err) => log(`Auto Update: ${err.message}`)), every);
  applyTray();
}

function applyTray() {
  const want = !!loadSettings().runInBackground;
  if (!want) { tray?.destroy(); tray = null; return; }
  if (tray) return;
  const img = nativeImage.createFromPath(path.join(here, "renderer", "icon.png")).resize({ width: 18, height: 18 });
  if (process.platform === "darwin") img.setTemplateImage(false);
  tray = new Tray(img); tray.setToolTip("Decomp Buddy");
  const open = () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { w.show(); w.focus(); } else app.emit("activate"); if (process.platform === "darwin") app.dock?.show(); };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Decomp Buddy", click: open },
    { label: "Check For Updates Now", click: () => checkNow().catch(() => {}) },
    { type: "separator" },
    { label: "Quit Decomp Buddy", click: () => { app.quitting = true; app.quit(); } },
  ]));
  tray.on("click", open);
}

// Closing the window keeps the app (and its schedule) running when you asked for that.
export const keepRunning = () => !!loadSettings().runInBackground && !app.quitting;

// Start With My Computer: opens hidden (--background) so updates run without a window popping up.
export function applyLoginItem() {
  const on = !!loadSettings().startAtLogin && app.isPackaged;
  if (process.platform === "linux") {
    const file = path.join(app.getPath("home"), ".config", "autostart", "decomp-buddy.desktop");
    if (!on) { fs.rmSync(file, { force: true }); return; }
    const exe = process.env.APPIMAGE || process.execPath;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=Decomp Buddy\nExec="${exe}" --background\nX-GNOME-Autostart-enabled=true\n`);
  } else app.setLoginItemSettings({ openAtLogin: on, args: ["--background"] });
}

ipcMain.handle("autoupdate:check", () => checkNow());
ipcMain.handle("autoupdate:last", () => last);
ipcMain.handle("autoupdate:apply", () => { applySchedule(); applyLoginItem(); return true; });

export function startBackground() {
  applySchedule();
  try { applyLoginItem(); } catch {}
  powerMonitor.on("resume", () => { if (SCHEDULES[loadSettings().updateSchedule]) setTimeout(() => checkNow().catch(() => {}), 30_000); });
}
