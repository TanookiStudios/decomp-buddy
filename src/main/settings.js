import path from "node:path";
// Moved out of main.js unchanged (2026-09-23): settings IPC handlers.
import { BrowserWindow, ipcMain, dialog, shell, nativeTheme , app } from "electron";
import fs from "node:fs";
import { sweepMacJunk } from "../junk.js";
import { writeInstallHtml } from "../installhtml.js";
import { PRESETS, resolveProvider } from "../providers.js";
import { listModels } from "../plan.js";
import { cleanStaging } from "../archive.js";
import { TARGETS, targetIsHost, defaultInstallDir, defaultTransferDir, inGamingMode } from "../targets.js";
import { BUILTIN } from "../catalog.js";
import { UPDATE_URL } from "../updates.js";
import { FINDS_URL } from "../sources/finds.js";
import { readVault } from "../vault.js";
import { steamDir } from "../steam.js";
import { fetchSharedSources, sourceKey, validateSourceEntry, normalizeUser, SOURCES_URL } from "../sources/shared-sources.js";
import { VERSION, vaultDir, logFile, encrypt, decrypt, loadSettings, saveSettings, outDirFor, defaultFindsFile, sourcesFileFor, currentTarget, githubToken, applyGitHubToken, here, githubRate } from "./core.js";
import { REDDIT_SUBS } from "../discover.js";
import { cleanLook } from "../look.js";
import { saveLook } from "./look.js";
import { kiosk } from "./window.js";

ipcMain.handle("settings:get", async () => {
  const s = loadSettings();
  const shared = await fetchSharedSources({ file: sourcesFileFor(s) });
  const id = s.provider || "claude";
  const saved = s.providers?.[id] || {};
  const target = currentTarget(s);
  return {
    installDir: s.installDir || defaultInstallDir(), transferDir: s.transferDir || s.outDir || defaultTransferDir(),
    outDir: outDirFor(s, target), targetIsHost: targetIsHost(target), targetKind: TARGETS[target].kind,
    moveFiles: s.moveFiles !== false, platform: process.platform,
    provider: id, model: saved.model || PRESETS[id]?.defaultModel || "", baseUrl: saved.baseUrl || PRESETS[id]?.baseUrl || "",
    hasKey: !!decrypt(saved), version: VERSION, hasGithubToken: !!githubToken(s), lang: s.lang || "system", langs: LANGS, osLang: app.getLocale(),
    theme: s.theme || "system", preferBoxart: !!s.preferBoxart, showAdultMods: !!s.showAdultMods, sawLegal: !!s.sawLegal, sawWhere: !!s.sawWhere, setupCount: s.setupCount || 0, nudgedAt: s.nudgedAt || [], collapsedGroups: s.collapsedGroups || [], vault: readVault(vaultDir()),
    wishlist: s.wishlist || {}, mine: s.mine || {}, digest: s.digest || null, startCouch: !!s.startCouch, countSetups: s.countSetups ?? null, libraryFolders: s.libraryFolders || [], steamAvailable: !!steamDir(),
    discoverSubs: s.discoverSubs || REDDIT_SUBS, discoverChannels: s.discoverChannels || [],
    githubRate: githubRate.limit ? { ...githubRate } : null, uiScale: s.uiScale || 1, shareStats: s.shareStats === true, padMap: s.padMap || {}, padNintendo: !!s.padNintendo, updateSchedule: s.updateSchedule || "off", autoUpdateAll: !!s.autoUpdateAll, runInBackground: !!s.runInBackground, startAtLogin: !!s.startAtLogin, look: cleanLook(s.look),
    kiosk: { on: !!s.kiosk?.on, hasPin: !!s.kiosk?.hash, locked: kiosk.locked },
    target: TARGETS[s.target] ? s.target : "windows", targets: Object.fromEntries(Object.entries(TARGETS).map(([k, t]) => [k, t.label])),
    sources: {
      builtin: BUILTIN.map((b) => ({ id: b.SOURCE.id, label: b.SOURCE.label, url: b.SOURCE.url, enabled: s.sources?.builtin?.[b.SOURCE.id] !== false })),
      shared: shared.map((c) => ({ ...c, key: sourceKey(c), enabled: !s.sources?.disabledShared?.[sourceKey(c)] })),
      custom: s.sources?.custom || [],
      pendingShared: s.pendingSharedSources || [],
    },
    sourcesUrl: SOURCES_URL,
    updateUrl: process.env.DECOMP_UPDATE_URL || UPDATE_URL,
    localFinds: s.localFinds || [], findsFile: s.findsFile || defaultFindsFile(), findsUrl: FINDS_URL,
    admin: s.admin === true,
    presets: Object.fromEntries(Object.entries(PRESETS).filter(([k]) => k !== "apple").map(([k, p]) => [k, { label: p.label, baseUrl: p.baseUrl, noKey: !!p.noKey, custom: k === "custom" }])),
  };
});
ipcMain.handle("settings:set", (_e, { padMap, padNintendo, shareStats, updateSchedule, autoUpdateAll, runInBackground, startAtLogin, uiScale, appleAI, apiKey, installDir, transferDir, moveFiles, provider, model, baseUrl, target, sources, findsFile, admin, theme, sawLegal, sawWhere, countSetups, collapsedGroups, wishlist, libraryFolders, discoverSubs, discoverChannels, nudgedAt, githubToken, lang, preferBoxart, showAdultMods, mine, digest, startCouch, look }) => {
  const s = loadSettings();
  // Make It Yours: patch-merged; null resets it (and deletes the copied picture and music).
  if (look !== undefined) saveLook(s, look && { ...s.look, ...look });
  if (appleAI !== undefined) s.appleAI = !!appleAI;
  // Auto Update (src/main/background.js applies them after the renderer saves: autoupdate:apply).
  if (shareStats !== undefined) s.shareStats = !!shareStats;
  // Controller remapping: button name -> the controller's button number.
  if (padMap) s.padMap = Object.fromEntries(Object.entries(padMap).filter(([k, v]) => ["A", "B", "X", "Y", "LB", "RB", "BACK", "START"].includes(k) && Number.isInteger(v) && v >= 0 && v < 32));
  if (padNintendo !== undefined) s.padNintendo = !!padNintendo;
  if (updateSchedule !== undefined) s.updateSchedule = ["off", "15m", "1h", "6h", "daily"].includes(updateSchedule) ? updateSchedule : "off";
  if (autoUpdateAll !== undefined) s.autoUpdateAll = !!autoUpdateAll;
  if (runInBackground !== undefined) s.runInBackground = !!runInBackground;
  if (startAtLogin !== undefined) s.startAtLogin = !!startAtLogin;
  if (uiScale !== undefined) { s.uiScale = Math.round(Math.max(0.5, Math.min(2, Number(uiScale) || 1)) * 100) / 100; for (const w of BrowserWindow.getAllWindows()) w.webContents.setZoomFactor(s.uiScale); }
  if (lang !== undefined) s.lang = lang === "system" || LANGS[lang] ? lang : "system";
  if (githubToken !== undefined) { if (githubToken) s.github = encrypt(githubToken); else delete s.github; applyGitHubToken(githubToken); }
  if (nudgedAt) s.nudgedAt = nudgedAt;
  if (discoverSubs) s.discoverSubs = discoverSubs.map((x) => String(x).trim().replace(/^r\//, "")).filter(Boolean);
  if (discoverChannels) s.discoverChannels = discoverChannels.map((x) => String(x).trim()).filter(Boolean);
  if (wishlist) s.wishlist = wishlist;
  if (libraryFolders) s.libraryFolders = libraryFolders.filter(Boolean);
  if (preferBoxart !== undefined) s.preferBoxart = !!preferBoxart;
  if (showAdultMods !== undefined) s.showAdultMods = !!showAdultMods;
  if (startCouch !== undefined) s.startCouch = !!startCouch;
  if (countSetups !== undefined) s.countSetups = !!countSetups;
  if (digest) s.digest = digest; // weekly What's New: { at, seen: { [id]: version }, items: [...] }
  // Your notes and star ratings, one entry per game: { [key]: { note, rating, at } }. Patch-merged.
  if (mine) { s.mine = { ...(s.mine || {}) }; for (const [k, v] of Object.entries(mine)) { if (v === null) delete s.mine[k]; else s.mine[k] = { note: String(v.note || "").slice(0, 4000), rating: Math.max(0, Math.min(5, Number(v.rating) || 0)), at: new Date().toISOString() }; } }
  if (theme) { s.theme = ["light", "dark"].includes(theme) ? theme : "system"; nativeTheme.themeSource = s.theme; }
  if (sawLegal !== undefined) s.sawLegal = !!sawLegal;
  if (sawWhere !== undefined) s.sawWhere = !!sawWhere;
  if (collapsedGroups) s.collapsedGroups = collapsedGroups;
  if (findsFile !== undefined) s.findsFile = findsFile;
  if (admin !== undefined) s.admin = !!admin;
  if (sources) {
    for (const c of sources.custom || []) { const why = validateSourceEntry(c); if (why) throw new Error(why); }
    s.sources = { builtin: sources.builtin || {}, disabledShared: sources.disabledShared || {}, custom: (sources.custom || []).filter((c) => c.value).map((c) => ({ type: c.type === "list" ? "list" : "github-user", value: c.type === "list" ? String(c.value).trim() : normalizeUser(c.value), enabled: c.enabled !== false })) };
  }
  if (installDir) s.installDir = installDir;
  if (transferDir) s.transferDir = transferDir;
  if (target && TARGETS[target]) s.target = target;
  if (moveFiles !== undefined) s.moveFiles = !!moveFiles;
  if (provider) s.provider = provider;
  const id = s.provider || "claude";
  s.providers ||= {};
  const cur = s.providers[id] || {};
  s.providers[id] = { ...cur, ...(apiKey ? encrypt(apiKey) : {}), ...(model !== undefined ? { model } : {}), ...(baseUrl !== undefined ? { baseUrl } : {}) };
  saveSettings(s);
  return true;
});
// Translations live in renderer/i18n/<code>.json (machine translated; English is the source).
export const LANGS = { en: "English", "pt-BR": "Português (Brasil)", es: "Español", fr: "Français", de: "Deutsch", ja: "日本語" };
ipcMain.handle("i18n:get", (_e, { code }) => {
  if (!LANGS[code] || code === "en") return null;
  try { return JSON.parse(fs.readFileSync(path.join(here, "renderer", "i18n", `${code}.json`), "utf8")); } catch { return null; }
});
ipcMain.handle("models:list", async (_e, { apiKey, baseUrl } = {}) => {
  const s = loadSettings();
  const id = s.provider || "claude";
  const saved = s.providers?.[id] || {};
  // model is irrelevant for listing; placeholder so resolveProvider only checks key + URL
  const provider = resolveProvider(id, { apiKey: apiKey || decrypt(saved), model: "-", baseUrl: baseUrl || saved.baseUrl });
  return listModels(provider);
});
ipcMain.handle("chooseFolder", async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("pickFile", async (e, { label, formats }) => {
  const exts = formats.map((f) => f.replace(/^\*?\./, "").toLowerCase()).filter((f) => /^[a-z0-9]+$/.test(f));
  const wantsFolder = formats.some((f) => /folder|director|extracted/i.test(f));
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    title: `Choose: ${label}`,
    properties: [wantsFolder ? "openDirectory" : "openFile"],
    filters: !wantsFolder && exts.length ? [{ name: `${label} or archive`, extensions: [...exts, "zip", "7z", "rar", "gz", "tgz", "bz2", "xz", "tar"] }, { name: "All Files", extensions: ["*"] }] : undefined,
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("chooseFile", async (e, { title, filters } = {}) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { title, defaultPath: "finds.json", filters: filters || [{ name: "JSON", extensions: ["json"] }] });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle("openLog", () => { try { fs.appendFileSync(logFile(), ""); } catch {} return shell.openPath(logFile()); });
ipcMain.handle("openExternal", (_e, url) => (/^https?:\/\//.test(url) && !kiosk.locked ? shell.openExternal(url) : Promise.resolve()));
ipcMain.handle("open", (_e, p) => shell.openPath(p));
// Steam Deck: Steam's on-screen keyboard for a text box (only in Gaming Mode or on a Deck; nowhere else does steam:// make sense).
ipcMain.handle("deck:keyboard", () => (process.env.SteamDeck === "1" || inGamingMode() ? shell.openExternal("steam://open/keyboard") : null));
ipcMain.handle("news:get", async () => {
  if (process.env.DECOMP_HEADLESS && !process.env.DECOMP_NEWS_FILE) return null;
  const { NEWS_URL, pickNews } = await import("../updates.js");
  try {
    const doc = process.env.DECOMP_NEWS_FILE ? JSON.parse(fs.readFileSync(process.env.DECOMP_NEWS_FILE, "utf8"))
      : await (await fetch(NEWS_URL, { headers: { "User-Agent": `decomp-buddy/${VERSION}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" })).json();
    return pickNews(doc, { version: VERSION, dismissed: loadSettings().newsDismissed || [] });
  } catch { return null; }
});
ipcMain.handle("news:dismiss", (_e, id) => { const s = loadSettings(); s.newsDismissed = [...new Set([...(s.newsDismissed || []), String(id).slice(0, 60)])].slice(-50); saveSettings(s); return true; });
ipcMain.handle("clean", (_e, outDir) => {
  outDir = outDir || outDirFor(loadSettings(), currentTarget(loadSettings()));
  cleanStaging(outDir);
  const removed = sweepMacJunk(outDir);
  const { count } = writeInstallHtml(outDir);
  return { removed: removed.length, count };
});

