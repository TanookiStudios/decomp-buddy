// Quick Play (src/quickplay.js): right-click the app's icon to start a recent game. Mac: the Dock menu. Windows: the
// taskbar jump list. Linux has no such menu. Rebuilt whenever the library is listed and after each Play.
import { app, Menu, BrowserWindow } from "electron";
import crypto from "node:crypto";
import { recentGames, playLink } from "../quickplay.js";
import { loadSettings, saveSettings } from "./core.js";

let last = "";
export function updateQuickPlay(library, { playGame, createWindow }) {
  const recent = recentGames(library);
  const sig = JSON.stringify(recent); if (sig === last) return recent; last = sig;
  if (process.platform === "darwin" && app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate(recent.map((g) => ({ label: g.title, click: () => {
      const w = BrowserWindow.getAllWindows()[0] || createWindow();
      try { playGame(w.webContents, g.folder); } catch {}
    } }))));
  } else if (process.platform === "win32" && app.isPackaged) {
    const s = loadSettings(); if (!s.shortcutKey) { s.shortcutKey = crypto.randomBytes(16).toString("hex"); saveSettings(s); }
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath; // the portable build runs from a temp copy
    try {
      app.setJumpList(recent.length ? [{ type: "custom", name: "Recent Games", items: recent.map((g) => ({ type: "task", title: g.title, program: exe, args: `"${playLink(g.folder, s.shortcutKey)}"`, iconPath: exe, iconIndex: 0 })) }] : null);
    } catch {}
  }
  return recent;
}
export const quickPlayItems = () => JSON.parse(last || "[]");
