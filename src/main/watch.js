// Tell Me When It's Playable (src/watch.js): the watch list lives in settings; on start and every 6 hours the
// catalog is checked, and a watched game that can be played now gets a notification and a Now Playable row.
import { ipcMain, BrowserWindow, Notification, app } from "electron";
import { loadSettings, saveSettings } from "./core.js";
import { loadCatalog } from "./catalog.js";
import { newlyPlayable } from "../watch.js";

const send = (ch, data) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send(ch, data); };
const state = () => { const s = loadSettings(); return { watching: Object.keys(s.watch || {}), ready: s.watchReady || [] }; };

ipcMain.handle("watch:get", () => state());
ipcMain.handle("watch:toggle", (_e, { key, title }) => {
  const s = loadSettings(), k = String(key || "").toLowerCase().slice(0, 300); if (!k) return state();
  s.watch ||= {};
  if (s.watch[k]) delete s.watch[k]; else s.watch[k] = { title: String(title || "").slice(0, 200), at: new Date().toISOString() };
  saveSettings(s); return state();
});
ipcMain.handle("watch:dismiss", (_e, { key }) => { const s = loadSettings(); s.watchReady = (s.watchReady || []).filter((r) => r.key !== key); saveSettings(s); return state(); });

export async function checkWatch() {
  const s0 = loadSettings(); if (!Object.keys(s0.watch || {}).length) return [];
  const { games } = await loadCatalog({ refresh: true });
  const hits = newlyPlayable(s0.watch, games); if (!hits.length) return [];
  const s = loadSettings(), at = new Date().toISOString();
  for (const h of hits) { delete s.watch[h.key]; s.watchReady = [...(s.watchReady || []).filter((r) => r.key !== h.key), { ...h, at }]; }
  saveSettings(s);
  if (!process.env.DECOMP_HEADLESS && Notification.isSupported()) for (const h of hits) {
    const n = new Notification({ title: "Now Playable", body: `${h.title} can be played now. Open Decomp Buddy to set it up.` });
    n.on("click", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { w.show(); w.focus(); } else app.emit("activate"); send("watch:open", h.id); });
    n.show();
  }
  send("watch:changed", state());
  return hits;
}
ipcMain.handle("watch:check", () => checkWatch());

export function startWatch() {
  setTimeout(() => checkWatch().catch(() => {}), 20_000);
  setInterval(() => checkWatch().catch(() => {}), 6 * 3600e3);
}
