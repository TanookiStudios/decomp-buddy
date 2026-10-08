// Moved out of main.js unchanged (2026-09-23): admin IPC handlers.
import { ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { repoKey, publishFinds, enrichFromGitHub, FINDS_URL } from "../sources/finds.js";
import { scanReddit, scanGitHub, scanBluesky, scanYouTube, scanGitHubTopics } from "../discover.js";
import { publishSources, removeSource, sourceKey, validateSourceEntry, normalizeUser } from "../sources/shared-sources.js";
import { logTo, loadSettings, saveSettings, defaultFindsFile, sourcesFileFor, state } from "./core.js";
import { planNewFinds } from "./plans.js";
import { readWaiting, waitingKeys, waitingFileNextTo } from "../waiting.js";

// --- Individual Finds / games you add yourself
ipcMain.handle("finds:add", async (_e, { repo, title, console: con, notes, via }) => {
  const key = repoKey(repo);
  if (!key) throw new Error("That doesn't look like a GitHub repository link.");
  const info = await enrichFromGitHub(key);
  if (!info.exists) throw new Error(`GitHub says ${key} doesn't exist.`);
  const s = loadSettings();
  const canon = info.repo.toLowerCase();
  try { const f = s.findsFile || defaultFindsFile(); if (JSON.parse(fs.readFileSync(f, "utf8")).games.some((g) => (repoKey(g.repo) || "").toLowerCase() === canon)) throw new Error(`${info.repo} is already published.`); } catch (err) { if (/already published/.test(err.message)) throw err; }
  const onCat = state.catalogGames.find((g) => g.owner && `${g.owner}/${g.repo}`.toLowerCase() === canon);
  if (onCat) throw new Error(`${info.repo} is already on a catalog (${(onCat.sources || [onCat.source]).join(", ")}).`);
  s.localFinds = (s.localFinds || []).filter((p) => (repoKey(p.repo) || "").toLowerCase() !== canon);
  s.localFinds.push({
    repo: info.repo, title: (title || "").trim() || info.repo.split("/")[1].replace(/[-_]+/g, " "), console: (con || "").trim() || info.consoleGuess || "Unknown",
    platforms: info.platforms, version: info.version, status: info.status, updatedAt: info.updatedAt,
    notes: (notes || "").trim() || info.notes, website: info.website, addedAt: new Date().toISOString(), via: via || "By hand",
  });
  saveSettings(s);
  planNewFinds(_e.sender, [info.repo]);
  return s.localFinds;
});
// Paste a pile of links. Each repo is canonicalised through GitHub (owner/name spelling, redirects
// for renamed repos), then refused if it's already pending, already published, or already on any catalog.
ipcMain.handle("finds:addMany", async (e, { text }) => {
  const log = (m) => logTo(e.sender, m);
  log("--- Admin bulk add");
  const keys = [...new Set([...String(text || "").matchAll(/(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?=[\/#?\s),\]'"<>]|$)/g)].map((m) => `${m[1]}/${m[2]}`.toLowerCase())
    .filter((k) => !/^(sponsors|orgs|topics|features|about|settings|marketplace|explore|search)\//.test(k)))];
  const s = loadSettings();
  const published = (() => { try { const f = s.findsFile || defaultFindsFile(); return new Set(JSON.parse(fs.readFileSync(f, "utf8")).games.map((g) => (repoKey(g.repo) || "").toLowerCase())); } catch { return new Set(); } })();
  const wdoc = readWaiting(waitingFileNextTo(s.findsFile || defaultFindsFile()));
  const keysOf = (list) => new Set((list || []).map((g) => (repoKey(g.repo) || "").toLowerCase()).filter(Boolean));
  const waiting = keysOf(wdoc.games), hidden = keysOf(wdoc.hidden);
  const pending = new Set((s.localFinds || []).map((p) => (repoKey(p.repo) || "").toLowerCase()));
  const onCatalog = new Set(state.catalogGames.filter((g) => g.owner).map((g) => `${g.owner}/${g.repo}`.toLowerCase()));
  const result = { added: [], duplicates: [], missing: [], invalid: [] };
  for (const key of keys) {
    const info = await enrichFromGitHub(key);
    if (!info.exists) { result.missing.push(key); continue; }
    const canon = info.repo.toLowerCase(); // GitHub's own spelling, follows renames
    const where = pending.has(canon) ? "pending" : published.has(canon) ? "published" : onCatalog.has(canon) ? "already on a catalog" : waiting.has(canon) ? "on Waiting For A Port" : hidden.has(canon) ? "hidden (not a PC game, or a duplicate)" : null;
    if (where) { result.duplicates.push({ repo: info.repo, where }); continue; }
    pending.add(canon);
    s.localFinds = s.localFinds || [];
    s.localFinds.push({ repo: info.repo, title: info.repo.split("/")[1].replace(/[-_]+/g, " "), console: info.consoleGuess || "Unknown", platforms: info.platforms, version: info.version, status: info.status, updatedAt: info.updatedAt, notes: info.notes, website: info.website, addedAt: new Date().toISOString(), via: "Bulk paste" });
    result.added.push(info.repo);
    log(`+ ${info.repo} (${info.consoleGuess || "console unknown"}${info.version ? `, ${info.version}` : ""})`);
  }
  saveSettings(s);
  log(`bulk add: ${result.added.length} added, ${result.duplicates.length} duplicate(s) ${result.duplicates.map((d) => `${d.repo}=${d.where}`).join(" ")}, ${result.missing.length} not found ${result.missing.join(" ")}`);
  planNewFinds(e.sender, result.added);
  return result;
});
// Discover: scan Reddit + GitHub search, keep only repos not already anywhere, remember dismissals.
ipcMain.handle("discover:scan", async (e) => {
  const log = (m) => logTo(e.sender, m);
  log("--- Discover scan");
  const s = loadSettings();
  const known = new Set(state.catalogGames.filter((g) => g.owner).map((g) => `${g.owner}/${g.repo}`.toLowerCase()));
  for (const p of s.localFinds || []) known.add((repoKey(p.repo) || "").toLowerCase());
  try { const f = s.findsFile || defaultFindsFile(); for (const g of JSON.parse(fs.readFileSync(f, "utf8")).games) known.add((repoKey(g.repo) || "").toLowerCase()); } catch {}
  for (const k of waitingKeys(waitingFileNextTo(s.findsFile || defaultFindsFile()))) known.add(k);
  const dismissed = s.discoverDismissed || {};
  const found = new Map(Object.entries(s.discovered || {}));
  const errors = [];
  const subs = s.discoverSubs?.length ? s.discoverSubs : ["decomps", "emulation", "decompilation"];
  const channels = s.discoverChannels || []; // YouTube killed RSS for most channels; opt-in only
  const feeds = [
    ["Reddit", () => scanReddit(subs)],
    ["Bluesky", () => scanBluesky()],
    ...(channels.length ? [["YouTube", async () => { const r = await scanYouTube(channels); for (const e of r.errors) errors.push(`YouTube ${e}`); return r.candidates; }]] : []),
    ["GitHub topics", () => scanGitHubTopics({ log })],
    ["GitHub search", () => scanGitHub({ log })],
  ];
  for (const [name, fn] of feeds) {
    try {
      const list = await fn();
      for (const e of list.errors || []) errors.push(`${name}: ${e}`);
      for (const c of list) { const k = c.repo.toLowerCase(); if (!known.has(k) && !dismissed[k]) found.set(k, { ...(found.get(k) || {}), ...c, found: found.get(k)?.found || new Date().toISOString() }); }
      log(`discover ${name}: ${list.length} candidate(s)${list.errors?.length ? ` (${list.errors.join("; ")})` : ""}`);
    } catch (err) { errors.push(`${name}: ${err.message}`); log(`discover ${name} failed: ${err.message}`); }
  }
  for (const k of [...found.keys()]) if (known.has(k) || dismissed[k]) found.delete(k);
  s.discovered = Object.fromEntries(found); s.lastDiscover = new Date().toISOString();
  saveSettings(s);
  log(`discover: ${found.size} candidate(s)${errors.length ? ` (${errors.join("; ")})` : ""}`);
  return { candidates: [...found.values()].sort((a, b) => String(b.seen || "").localeCompare(String(a.seen || ""))), errors, at: s.lastDiscover };
});
ipcMain.handle("discover:list", () => { const s = loadSettings(); return { candidates: Object.values(s.discovered || {}).sort((a, b) => String(b.seen || "").localeCompare(String(a.seen || ""))), at: s.lastDiscover || null }; });
ipcMain.handle("discover:dismiss", (_e, { repo }) => { const s = loadSettings(); const k = String(repo).toLowerCase(); s.discoverDismissed = { ...(s.discoverDismissed || {}), [k]: true }; if (s.discovered) delete s.discovered[k]; saveSettings(s); return true; });
ipcMain.handle("discover:forget", (_e, { repo }) => { const s = loadSettings(); if (s.discovered) delete s.discovered[String(repo).toLowerCase()]; saveSettings(s); return true; });
ipcMain.handle("finds:remove", (_e, { repo }) => {
  const s = loadSettings();
  s.localFinds = (s.localFinds || []).filter((p) => (repoKey(p.repo) || "").toLowerCase() !== String(repo).toLowerCase());
  saveSettings(s);
  return s.localFinds;
});
ipcMain.handle("finds:publish", (_e, { file }) => {
  const s = loadSettings();
  if (file) { s.findsFile = file; saveSettings(s); }
  const target = s.findsFile;
  if (!target) throw new Error("Choose where finds.json lives first (Settings → Individual Finds).");
  const out = publishFinds(target, s.localFinds || []);
  const srcOut = publishSources(path.join(path.dirname(target), "sources.json"), s.pendingSharedSources || []);
  s.pendingSharedSources = []; saveSettings(s);
  return { file: target, count: out.games.length, sources: srcOut.sources.length };
});
// The shared list as currently published (file on disk for the admin, else the live feed).
ipcMain.handle("finds:published", async () => {
  const s = loadSettings();
  const file = s.findsFile || defaultFindsFile();
  try { if (file && fs.existsSync(file)) return { from: file, ...JSON.parse(fs.readFileSync(file, "utf8")) }; } catch {}
  try { const res = await fetch(FINDS_URL, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(15_000), cache: "no-store" }); if (res.ok) return { from: FINDS_URL, ...(await res.json()) }; } catch {}
  return { from: "", games: [] };
});
// Shared (managed) sources: admin adds -> pending -> Publish writes sources.json next to finds.json.
ipcMain.handle("sources:addShared", (_e, { type, value, label }) => {
  const s = loadSettings();
  const why = validateSourceEntry({ type, value }); if (why) throw new Error(why);
  const entry = { type: type === "list" ? "list" : "github-user", value: type === "list" ? String(value).trim() : normalizeUser(value), label: String(label || "").trim() };
  s.pendingSharedSources = (s.pendingSharedSources || []).filter((p) => sourceKey(p) !== sourceKey(entry));
  s.pendingSharedSources.push(entry);
  saveSettings(s);
  return s.pendingSharedSources;
});
ipcMain.handle("sources:removePending", (_e, { key }) => { const s = loadSettings(); s.pendingSharedSources = (s.pendingSharedSources || []).filter((p) => sourceKey(p) !== key); saveSettings(s); return s.pendingSharedSources; });
ipcMain.handle("sources:unpublish", (_e, { key }) => { const s = loadSettings(); const f = sourcesFileFor(s); if (!f) throw new Error("No site folder configured."); return removeSource(f, key); });
ipcMain.handle("finds:unpublish", (_e, { repo }) => {
  const s = loadSettings();
  const file = s.findsFile || defaultFindsFile();
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.games = (data.games || []).filter((g) => (repoKey(g.repo) || "").toLowerCase() !== String(repo).toLowerCase());
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return data.games.length;
});
// Deploy the site that hosts finds.json: runs its "deploy" script (wrangler pages deploy), streaming output.
ipcMain.handle("finds:deploy", async (e) => {
  const s = loadSettings();
  const file = s.findsFile || defaultFindsFile();
  const site = file && file.includes(`${path.sep}public${path.sep}`) ? file.slice(0, file.indexOf(`${path.sep}public${path.sep}`)) : null;
  if (!site || !fs.existsSync(path.join(site, "package.json"))) throw new Error("finds.json isn't inside a site repo with a package.json - deploy it by hand.");
  // The public catalog (catalog.json) is rebuilt from everything being published, then shipped with it.
  try { const { buildCatalog } = await import("../publiccatalog.js"); await buildCatalog({ site, log: (m) => logTo(e.sender, m) }); }
  catch (err) { logTo(e.sender, `catalog.json not rebuilt: ${err.message}`); }
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "deploy"], { cwd: site, env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` } });
    const send = (m) => logTo(e.sender, m.toString().trimEnd());
    child.stdout.on("data", send); child.stderr.on("data", send);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve({ site }) : reject(new Error(`deploy exited with ${code}`))));
  });
});
