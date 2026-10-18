// "How Did It Run?" player reports, and the opt-in usage stats - both on tanookistudios.com.
// A report says: this game, runs well / has issues / doesn't run, on this kind of computer (and why, if you pick a
// reason). It's tied to a random id this install makes for itself (never shared between computers; the site keeps
// only a salted hash), so you can change or take it back. Usage stats go only if you tick the box, at most weekly,
// with no id at all.
import { ipcMain, app } from "electron";
import crypto from "node:crypto";
import { loadSettings, saveSettings, libraryDirs, VERSION } from "./core.js";
import { readManifests } from "../installhtml.js";

const BASE = () => (process.env.DECOMP_SUGGEST_BASE || "https://tanookistudios.com").replace(/\/$/, "");
export const VERDICTS = ["runs", "issues", "no"], REASONS = ["download", "crash", "files", "graphics", "sound", "controls", "other"];
export const sysOf = (env = process.env, platform = process.platform, arch = process.arch) => env.SteamDeck === "1" ? "deck"
  : `${{ win32: "windows", darwin: "macos", linux: "linux" }[platform] || "linux"}-${arch === "arm64" ? "arm64" : "x64"}`;
const voterId = () => { const s = loadSettings(); if (!/^[0-9a-f]{32}$/.test(s.voterId || "")) { s.voterId = crypto.randomBytes(16).toString("hex"); saveSettings(s); } return s.voterId; };

ipcMain.handle("reports:send", async (_e, { game, verdict = null, reason = null, tag = null }) => {
  if (verdict !== null && !VERDICTS.includes(verdict)) throw new Error("Unknown report.");
  if (reason && !REASONS.includes(reason)) reason = "other";
  const s = loadSettings(), mine = { ...(s.myReports || {}) };
  const body = { game: String(game).toLowerCase(), voter: voterId(), verdict, reason, sys: sysOf(), tag };
  let res = null;
  if (!process.env.DECOMP_HEADLESS || process.env.DECOMP_REPORTS_LIVE) {
    const r = await fetch(`${BASE()}/api/decomp-report`, { method: "POST", headers: { "content-type": "application/json", "User-Agent": `decomp-buddy/${VERSION}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    res = await r.json().catch(() => null);
    if (!r.ok || !res?.ok) throw new Error(r.status === 429 ? "That's a lot of reports in an hour - try again later." : "The report didn't go through. Check your internet and try again.");
  }
  if (verdict === null) delete mine[body.game]; else mine[body.game] = { verdict, reason, at: new Date().toISOString() };
  const st = loadSettings(); st.myReports = mine; saveSettings(st); countsAt = 0;
  return { sys: body.sys, counts: res?.counts || null };
});

let counts = null, countsAt = 0;
ipcMain.handle("reports:counts", async () => {
  if (counts && Date.now() - countsAt < 10 * 60e3) return { counts, sys: sysOf(), mine: loadSettings().myReports || {} };
  try {
    const r = await fetch(`${BASE()}/api/decomp-reports`, { headers: { "User-Agent": `decomp-buddy/${VERSION}` }, signal: AbortSignal.timeout(15_000) });
    if (r.ok) { const d = await r.json(); counts = { byGame: d.counts || {}, broken: d.broken || {} }; countsAt = Date.now(); }
  } catch {}
  return { counts: counts || { byGame: {}, broken: {} }, sys: sysOf(), mine: loadSettings().myReports || {} };
});

// ---- Usage stats (opt in): exactly this, shown in Settings before you tick the box.
export function statsPayload(s = loadSettings()) {
  const games = libraryDirs(s).reduce((n, d) => n + readManifests(d).length, 0);
  const lang = (s.lang && s.lang !== "system" ? s.lang : app.getLocale?.() || "en").replace(/_/g, "-");
  const uses = [s.syncDir && "saveSync", s.updateSchedule && s.updateSchedule !== "off" && "autoUpdate", s.startCouch && "couch", s.kiosk?.on && "kiosk"].filter(Boolean);
  return { v: VERSION, os: { win32: "windows", darwin: "macos", linux: "linux" }[process.platform], arch: process.arch === "arm64" ? "arm64" : "x64", deck: process.env.SteamDeck === "1",
    lang: /^[a-z]{2}(-[A-Z]{2})?$/.test(lang) ? lang : lang.slice(0, 2), games: games === 0 ? "0" : games <= 5 ? "1-5" : games <= 20 ? "6-20" : "21+", uses };
}
ipcMain.handle("stats:preview", () => statsPayload());
export async function sendStatsIfDue() {
  const s = loadSettings();
  if (process.env.DECOMP_HEADLESS || s.shareStats !== true || (s.statsSentAt && Date.now() - Date.parse(s.statsSentAt) < 7 * 24 * 3600e3)) return;
  try {
    const r = await fetch(`${BASE()}/api/decomp-stats`, { method: "POST", headers: { "content-type": "application/json", "User-Agent": "decomp-buddy" }, body: JSON.stringify(statsPayload(s)), signal: AbortSignal.timeout(15_000) });
    if (r.ok) { const st = loadSettings(); st.statsSentAt = new Date().toISOString(); saveSettings(st); }
  } catch {}
}
