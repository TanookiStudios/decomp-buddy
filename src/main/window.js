// Moved out of main.js unchanged (2026-09-23): window IPC handlers.
import { BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { here, loadSettings, saveSettings } from "./core.js";
import { setupAutoUpdater } from "./updater.js";
import { inGamingMode } from "../targets.js";

export function createWindow() {
  const s = loadSettings();
  const b = s.window || {};
  const win = new BrowserWindow({
    width: b.width || 1100, height: b.height || 820, x: b.x, y: b.y, minWidth: 560, minHeight: 520,
    title: "Decomp Buddy", show: !process.env.DECOMP_HEADLESS, // test harness: never on screen
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true },
  });
  if (b.maximized && !process.env.DECOMP_HEADLESS) win.maximize();
  // Remember size and position (debounced) so it opens the way it was left.
  let t;
  const remember = () => { clearTimeout(t); t = setTimeout(() => { const cur = loadSettings(); cur.window = { ...win.getNormalBounds(), maximized: win.isMaximized() }; saveSettings(cur); }, 400); };
  win.on("resize", remember); win.on("move", remember); win.on("maximize", remember); win.on("unmaximize", remember);
  win.loadFile(path.join(here, "renderer", "index.html"));
  setupAutoUpdater(win);
  return win;
}

// Couch Mode goes full screen (never in the headless test harness - that would put a window on screen).
ipcMain.handle("window:fullscreen", (e, { on }) => { if (process.env.DECOMP_HEADLESS) return false; const w = BrowserWindow.fromWebContents(e.sender); w?.setFullScreen(!!on); return !!on; });
// Started with --couch (the Steam / Steam Deck shortcut does this), or "Start In Couch Mode" is on.
// A Steam Deck in Gaming Mode has no keyboard or mouse in reach: start in Couch Mode there too.
ipcMain.handle("couch:atStart", () => process.argv.includes("--couch") || !!loadSettings().startCouch || inGamingMode());
