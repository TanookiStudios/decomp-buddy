// Shared by every IPC module: settings on disk, the log, the active AI provider, where things go,
// and the little bit of state the handlers share (catalog in memory, analysed repos, busy flag).
import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProvider } from "../providers.js";
import { TARGETS, targetIsHost, defaultInstallDir, defaultTransferDir } from "../targets.js";

export const here = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const VERSION = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8")).version;
export const vaultDir = () => path.join(app.getPath("userData"), "bios");
export const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
export const logFile = () => path.join(app.getPath("userData"), "decomp-buddy.log");
// Every line shown in the app also lands in a file, so "what happened?" has an answer later.
export function logTo(sender, m) {
  try { fs.appendFileSync(logFile(), `${new Date().toISOString()} ${m}\n`); } catch {}
  safeSend(sender, "log", m);
}
// send() that never throws on a closed window.
export function safeSend(sender, channel, payload) { try { if (sender && !sender.isDestroyed()) sender.send(channel, payload); } catch {} }

export const encrypt = (k) => (safeStorage.isEncryptionAvailable() ? { apiKeyEnc: safeStorage.encryptString(k).toString("base64") } : { apiKeyPlain: k }); // plain only on Linux without a keyring
export const decrypt = (p) => (p.apiKeyEnc && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(p.apiKeyEnc, "base64")) : p.apiKeyPlain || "");

// { outDir, moveFiles, provider: presetId, providers: { [presetId]: { apiKeyEnc|apiKeyPlain, model, baseUrl } } }
export function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), "utf8")); } catch { return {}; }
}
export function saveSettings(s) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s));
}
export function activeProvider(s) {
  const id = s.provider || "claude";
  const saved = s.providers?.[id] || {};
  return resolveProvider(id, { apiKey: decrypt(saved), model: saved.model, baseUrl: saved.baseUrl });
}

// Which folder a target lands in: games for this machine -> install folder; others -> transfer folder.
export function outDirFor(s, target) {
  const id = TARGETS[target] ? target : "windows";
  return targetIsHost(id) ? (s.installDir || defaultInstallDir()) : (s.transferDir || s.outDir || defaultTransferDir());
}
// On Maddie's Mac the site repo is right there; everyone else fills the path in by hand.
export function defaultFindsFile() {
  const site = path.join(app.getPath("home"), "Documents", "GitHub", "TanookiStudios-Site", "public");
  return fs.existsSync(site) ? path.join(site, "decomp-buddy", "finds.json") : "";
}
export const plansFileFor = (s) => { const f = s.findsFile || defaultFindsFile(); return f ? path.join(path.dirname(f), "plans.json") : ""; };
export const sourcesFileFor = (s) => { const f = s.findsFile || defaultFindsFile(); return f ? path.join(path.dirname(f), "sources.json") : ""; };
export function currentTarget(s) { return TARGETS[s.target] ? s.target : "windows"; }
export const libraryDirs = (s) => [...new Set([s.installDir || defaultInstallDir(), s.transferDir || s.outDir || defaultTransferDir(), ...(s.libraryFolders || [])])].filter((d) => fs.existsSync(d));

// GitHub token (optional): one chokepoint so every api.github.com call in the main process carries it.
export const githubToken = (s) => (s.github ? decrypt(s.github) : "");
export function applyGitHubToken(token) { process.env.GITHUB_TOKEN = token || ""; }
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
  const url = typeof input === "string" ? input : input?.url || String(input);
  // Test hook: behave exactly like a machine with no network.
  if (process.env.DECOMP_OFFLINE && /^https?:/.test(url)) return Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }));
  if (process.env.GITHUB_TOKEN && url.startsWith("https://api.github.com/")) {
    const h = new Headers(init.headers || {});
    if (!h.has("authorization")) h.set("authorization", `Bearer ${process.env.GITHUB_TOKEN}`);
    init = { ...init, headers: h };
  }
  return realFetch(input, init);
};

export const isNetworkError = (err) => err?.name === "TypeError" && /fetch failed/i.test(err.message) || ["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "EAI_AGAIN", "ETIMEDOUT", "ENETUNREACH"].includes(err?.cause?.code) || err?.name === "TimeoutError";
// Things read from the network, kept on disk so they still work offline (repo context, game pages).
export function diskCache(kind) {
  const dir = () => path.join(app.getPath("userData"), "cache", kind);
  const file = (key) => path.join(dir(), `${String(key).toLowerCase().replace(/[^a-z0-9._-]+/g, "_")}.json`);
  return {
    get: (key) => { try { return JSON.parse(fs.readFileSync(file(key), "utf8")); } catch { return null; } },
    set: (key, v) => { try { fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(file(key), JSON.stringify({ at: new Date().toISOString(), v })); } catch {} },
  };
}

// Local-only stats (Admin → Stats): one sample per kind per day, a year kept. Nothing leaves the machine.
export function sampleStat(kind, value) {
  const s = loadSettings(); const day = new Date().toISOString().slice(0, 10);
  s.stats ||= {}; s.stats[kind] ||= {};
  s.stats[kind][day] = value;
  const days = Object.keys(s.stats[kind]).sort(); for (const d of days.slice(0, Math.max(0, days.length - 365))) delete s.stats[kind][d];
  saveSettings(s);
}

// Mutable state shared across modules. catalogGames: the merged catalog as Browse last saw it.
// pending: analysed repos waiting for picks (README/tree never leaves the main process). busy: one analyze/setup at a time.
export const state = { catalogGames: [], pending: new Map(), busy: false };

// Before a new version touches settings.json for the first time, keep a copy of the old one.
// Admin's pending finds live only in this file until published, so it's the one thing worth guarding.
export function backupSettingsOnUpgrade() {
  const file = settingsFile();
  if (!fs.existsSync(file)) return null;
  const s = loadSettings();
  if (s.lastVersion === VERSION) return null;
  const dir = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `settings-${s.lastVersion || "before-" + VERSION}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.copyFileSync(file, out);
  const old = fs.readdirSync(dir).filter((f) => f.startsWith("settings-")).sort((a, b) => fs.statSync(path.join(dir, a)).mtimeMs - fs.statSync(path.join(dir, b)).mtimeMs);
  for (const f of old.slice(0, Math.max(0, old.length - 10))) fs.rmSync(path.join(dir, f));
  s.lastVersion = VERSION; saveSettings(s);
  logTo(null, `Backed up settings before ${VERSION}: ${out}`);
  return out;
}
