// Moved out of main.js unchanged (2026-09-23): window IPC handlers.
import { BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { here, loadSettings, saveSettings } from "./core.js";
import { setupAutoUpdater } from "./updater.js";
import { inGamingMode } from "../targets.js";
import { hashPin, validPin, pinGate } from "../kiosk.js";

// Interface Size in Settings: 50% to 200%.
export const uiScaleOf = (s) => { const n = Number(s.uiScale); return n >= 0.5 && n <= 2 ? n : 1; };

// Kiosk Mode (arcade cabinets, shared PCs): locked from launch until the PIN is entered.
export const kiosk = { locked: false };
const tryPin = pinGate();

export function createWindow() {
  const s = loadSettings();
  kiosk.locked = !!(s.kiosk?.on && s.kiosk.hash);
  const b = s.window || {};
  const win = new BrowserWindow({
    width: b.width || 1100, height: b.height || 820, x: b.x, y: b.y, minWidth: 560, minHeight: 520,
    title: "Decomp Buddy", show: !process.env.DECOMP_HEADLESS, // test harness: never on screen
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, zoomFactor: uiScaleOf(s) },
  });
  if (b.maximized && !process.env.DECOMP_HEADLESS) win.maximize();
  // Remember size and position (debounced) so it opens the way it was left.
  let t;
  const remember = () => { clearTimeout(t); t = setTimeout(() => { const cur = loadSettings(); cur.window = { ...win.getNormalBounds(), maximized: win.isMaximized() }; saveSettings(cur); }, 400); };
  win.on("resize", remember); win.on("move", remember); win.on("maximize", remember); win.on("unmaximize", remember);
  // Closing a locked kiosk needs the PIN too: the page shows its keypad instead.
  win.on("close", (e) => { if (kiosk.locked) { e.preventDefault(); win.webContents.send("kiosk:close"); } });
  win.loadFile(path.join(here, "renderer", "index.html"));
  setupAutoUpdater(win);
  return win;
}

// Couch Mode goes full screen (never in the headless test harness - that would put a window on screen).
ipcMain.handle("window:fullscreen", (e, { on }) => { if (process.env.DECOMP_HEADLESS) return false; const w = BrowserWindow.fromWebContents(e.sender); w?.setFullScreen(!!on); return !!on; });
// Started with --couch (the Steam / Steam Deck shortcut does this), or "Start In Couch Mode" is on.
// A Steam Deck in Gaming Mode has no keyboard or mouse in reach: start in Couch Mode there too.
ipcMain.handle("couch:atStart", () => kiosk.locked || process.argv.includes("--couch") || !!loadSettings().startCouch || inGamingMode());
// The page's own close (after the PIN, when the close button asked for it) goes through the same check.
ipcMain.handle("window:close", (e) => { BrowserWindow.fromWebContents(e.sender)?.close(); return true; });
ipcMain.handle("kiosk:check", (_e, pin) => { const r = tryPin(String(pin ?? ""), loadSettings().kiosk); if (r.ok) kiosk.locked = false; return r; });
// Settings only (never while locked): a new PIN, Start In Kiosk Mode (which locks it right away), or off.
ipcMain.handle("kiosk:set", (_e, { pin, on, off } = {}) => {
  if (kiosk.locked) throw new Error("Kiosk Mode is locked.");
  const s = loadSettings();
  if (off) delete s.kiosk;
  if (pin !== undefined) { if (!validPin(pin)) throw new Error("The PIN needs 4 to 8 digits."); s.kiosk = { ...s.kiosk, ...hashPin(pin) }; }
  if (on !== undefined) { if (on && !s.kiosk?.hash) throw new Error("Set a PIN first."); s.kiosk = { ...s.kiosk, on: !!on }; kiosk.locked = !!on; }
  saveSettings(s);
  return { on: !!s.kiosk?.on, hasPin: !!s.kiosk?.hash, locked: kiosk.locked };
});
