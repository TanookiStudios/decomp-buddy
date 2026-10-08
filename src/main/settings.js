import path from "node:path";
// Moved out of main.js unchanged (2026-09-23): settings IPC handlers.
import { BrowserWindow, ipcMain, dialog, shell, nativeTheme , app } from "electron";
import fs from "node:fs";
import { sweepMacJunk } from "../junk.js";
import { writeInstallHtml } from "../installhtml.js";
import { PRESETS, resolveProvider } from "../providers.js";
import { listModels } from "../plan.js";
import { cleanStaging } from "../archive.js";
import { TARGETS, targetIsHost, defaultInstallDir, defaultTransferDir } from "../targets.js";
import { BUILTIN } from "../catalog.js";
import { UPDATE_URL } from "../updates.js";
import { FINDS_URL } from "../sources/finds.js";
import { readVault } from "../vault.js";
import { steamDir } from "../steam.js";
import { fetchSharedSources, sourceKey, validateSourceEntry, normalizeUser, SOURCES_URL } from "../sources/shared-sources.js";
import { VERSION, vaultDir, logFile, encrypt, decrypt, loadSettings, saveSettings, outDirFor, defaultFindsFile, sourcesFileFor, currentTarget, githubToken, applyGitHubToken, here } from "./core.js";

ipcMain.handle("settings:get", async () => {
  const s = loadSettings();
  const shared = await fetchSharedSources({ file: sourcesFileFor(s) });
  const id = s.provider || "claude";
  const saved = s.providers?.[id] || {};
  const target = currentTarget(s);
  return {
    installDir: s.installDir || defaultInstallDir(), transferDir: s.transferDir || s.outDir || defaultTransferDir(),
    outDir: outDirFor(s, target), targetIsHost: targetIsHost(target),
    moveFiles: s.moveFiles !== false, platform: process.platform,
    provider: id, model: saved.model || PRESETS[id]?.defaultModel || "", baseUrl: saved.baseUrl || PRESETS[id]?.baseUrl || "",
    hasKey: !!decrypt(saved), version: VERSION, hasGithubToken: !!githubToken(s), lang: s.lang || "system", langs: LANGS, osLang: app.getLocale(),
    theme: s.theme || "system", preferBoxart: !!s.preferBoxart, sawLegal: !!s.sawLegal, setupCount: s.setupCount || 0, nudgedAt: s.nudgedAt || [], collapsedGroups: s.collapsedGroups || [], vault: readVault(vaultDir()),
    wishlist: s.wishlist || {}, mine: s.mine || {}, digest: s.digest || null, startCouch: !!s.startCouch, libraryFolders: s.libraryFolders || [], steamAvailable: !!steamDir(),
    discoverSubs: s.discoverSubs || ["decomps", "emulation", "decompilation"], discoverChannels: s.discoverChannels || [],
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
    presets: Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, { label: p.label, baseUrl: p.baseUrl, noKey: !!p.noKey, custom: k === "custom" }])),
  };
});
ipcMain.handle("settings:set", (_e, { apiKey, installDir, transferDir, moveFiles, provider, model, baseUrl, target, sources, findsFile, admin, theme, sawLegal, collapsedGroups, wishlist, libraryFolders, discoverSubs, discoverChannels, nudgedAt, githubToken, lang, preferBoxart, mine, digest, startCouch }) => {
  const s = loadSettings();
  if (lang !== undefined) s.lang = lang === "system" || LANGS[lang] ? lang : "system";
  if (githubToken !== undefined) { if (githubToken) s.github = encrypt(githubToken); else delete s.github; applyGitHubToken(githubToken); }
  if (nudgedAt) s.nudgedAt = nudgedAt;
  if (discoverSubs) s.discoverSubs = discoverSubs.map((x) => String(x).trim().replace(/^r\//, "")).filter(Boolean);
  if (discoverChannels) s.discoverChannels = discoverChannels.map((x) => String(x).trim()).filter(Boolean);
  if (wishlist) s.wishlist = wishlist;
  if (libraryFolders) s.libraryFolders = libraryFolders.filter(Boolean);
  if (preferBoxart !== undefined) s.preferBoxart = !!preferBoxart;
  if (startCouch !== undefined) s.startCouch = !!startCouch;
  if (digest) s.digest = digest; // weekly What's New: { at, seen: { [id]: version }, items: [...] }
  // Your notes and star ratings, one entry per game: { [key]: { note, rating, at } }. Patch-merged.
  if (mine) { s.mine = { ...(s.mine || {}) }; for (const [k, v] of Object.entries(mine)) { if (v === null) delete s.mine[k]; else s.mine[k] = { note: String(v.note || "").slice(0, 4000), rating: Math.max(0, Math.min(5, Number(v.rating) || 0)), at: new Date().toISOString() }; } }
  if (theme) { s.theme = ["light", "dark"].includes(theme) ? theme : "system"; nativeTheme.themeSource = s.theme; }
  if (sawLegal !== undefined) s.sawLegal = !!sawLegal;
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
ipcMain.handle("openExternal", (_e, url) => (/^https?:\/\//.test(url) ? shell.openExternal(url) : Promise.resolve()));
ipcMain.handle("open", (_e, p) => shell.openPath(p));
ipcMain.handle("clean", (_e, outDir) => {
  outDir = outDir || outDirFor(loadSettings(), currentTarget(loadSettings()));
  cleanStaging(outDir);
  const removed = sweepMacJunk(outDir);
  const { count } = writeInstallHtml(outDir);
  return { removed: removed.length, count };
});

