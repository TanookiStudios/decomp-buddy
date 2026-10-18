// Moved out of main.js unchanged (2026-09-23): setup IPC handlers.
import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { analyzeBatch, setupBatch } from "../run.js";
import { verifyPick } from "../verify.js";
import { isArchive, stageArchive } from "../archive.js";
import { conversionFor, convertFile } from "../convert.js";
import { TARGETS } from "../targets.js";
import { vaultMatch } from "../vault.js";
import { fetchPublished } from "../plans.js";
import { BrowserWindow, dialog } from "electron";
import { gameFolderName, DownloadCtrl } from "../setup.js";
import { resolveProvider } from "../providers.js";
import { status as appleStatus } from "../appleai.js";
import { fetchContextFor } from "../hosts.js";
import { matchAsset } from "../follow.js";
import { sortDiscs } from "../discs.js";
import { readIndex, findInLibrary } from "../romindex.js";
import { checkAgainstDats } from "../dat.js";
import { dumpKind } from "../dump.js";
import { romIndexFile, datDir, savesOf } from "./files.js";
import { backupSaves } from "../saves.js";
import { countSetups } from "./setupcount.js";
import { kiosk } from "./window.js";
import { vaultDir, logTo, loadSettings, saveSettings, activeProvider, outDirFor, plansFileFor, currentTarget, state, diskCache, isNetworkError } from "./core.js";

ipcMain.handle("verify", async (e, { path: file, gameFile, outDir }) => {
  const log = (m) => logTo(e.sender, m);
  const s = loadSettings();
  const stagingRoot = outDir || outDirFor(s, currentTarget(s));
  let resolved = file, extractedFrom = null, convertedFrom = null;
  if (isArchive(file) && !fs.statSync(file).isDirectory()) {
    const staged = await stageArchive(file, gameFile, { outDir: stagingRoot, log });
    resolved = staged.path; extractedFrom = path.basename(file);
  }
  // Wrong format but a known conversion? Convert into staging and verify the result.
  const conv = !fs.statSync(resolved).isDirectory() && conversionFor(resolved, gameFile.accepted_formats || []);
  if (conv) {
    const dir = path.join(stagingRoot, ".decomp-buddy-staging", `${Date.now()}-convert`);
    const out = await convertFile(resolved, dir, conv, { log });
    convertedFrom = path.basename(resolved); resolved = out;
  }
  let result = await verifyPick(resolved, gameFile, { log });
  // Your DAT files (No-Intro / Redump), when you've added any: a byte-for-byte check against the preservation sets.
  if (!fs.statSync(resolved).isDirectory() && gameFile.kind !== "bios") {
    const d = await checkAgainstDats(datDir(), resolved).catch((err) => ({ matched: false, note: err.message }));
    if (d) result = { ...result, dat: d, summary: `${result.summary} · ${d.matched ? `Matches ${d.dat}: ${d.game}` : `DAT: ${d.note}`}` };
  }
  if (resolved === file) return result;
  const via = [convertedFrom && `converted from ${convertedFrom}`, extractedFrom && `from ${extractedFrom}`].filter(Boolean).join(", ");
  return { ...result, resolvedPath: resolved, extractedFrom, convertedFrom, summary: `${path.basename(resolved)} (${via}) - ${result.summary}` };
});

ipcMain.handle("analyze", async (e, { urls }) => {
  if (state.busy) throw new Error("Already working.");
  state.busy = true;
  const log = (m) => logTo(e.sender, m);
  log(`--- Read Repos: ${urls.map((u) => (typeof u === "string" ? u : u.url)).join(", ")}`);
  try {
    const settings = loadSettings();
    let provider = null;
    try { provider = activeProvider(settings); }
    catch (err) {
      // Fallback order: published plan -> your own key -> a local model you've tested -> Apple Intelligence on this Mac.
      if (settings.localModel?.enabled && settings.localModel.model) { provider = resolveProvider("ollama", { model: settings.localModel.model }); log(`No AI key - repos without a published plan use your local model (${settings.localModel.model}).`); }
      else if (settings.appleAI !== false && (await appleStatus()).available) { provider = resolveProvider("apple"); log("No AI key - repos without a published plan use Apple Intelligence on this Mac (free, on-device)."); }
      else log(`No AI key set - published plans only (${err.message})`);
    }
    const target = TARGETS[settings.target] ? settings.target : "windows";
    const published = await fetchPublished({ file: plansFileFor(settings), cacheDir: app.getPath("userData") });
    const ctxCache = diskCache("repo");
    const fetchContext = async (ref) => {
      const key = `${ref.host || "github"}:${ref.owner}/${ref.repo}`;
      try { const c = await fetchContextFor(ref); ctxCache.set(key, c); return c; }
      catch (err) { const hit = isNetworkError(err) && ctxCache.get(key); if (!hit) throw isNetworkError(err) ? new Error("You're offline and this repo hasn't been read on this computer before.") : err; log(`Offline - using what was read on ${hit.at.slice(0, 10)}.`); return hit.v; }
    };
    const items = await analyzeBatch(urls, { provider, log, target, published, fetchContext });
    const romIndex = readIndex(romIndexFile());
    state.pending.clear();
    return items.map((it) => {
      if (!it.ok) return { id: it.id, url: it.url, ok: false, error: it.error };
      state.pending.set(it.id, it);
      const { game_title, console: platform, build, game_files } = it.plan;
      // Review: what will be downloaded and where it goes, editable before Set Up.
      const rel = (it.ctx.releases || []).find((r) => (build.release_tag ? r.tag === build.release_tag : false) && r.assets.some((a) => a.name === build.release_asset))
        || (it.ctx.releases || []).find((r) => r.assets.some((a) => a.name === build.release_asset)) || null;
      const review = {
        tag: rel?.tag || build.release_tag || null, asset: build.release_asset || null,
        assets: (rel?.assets || []).map((a) => ({ name: a.name, size: a.size })),
        folder: gameFolderName(it.plan), outDir: outDirFor(settings, target), executable: build.executable || null,
      };
      return {
        id: it.id, url: it.url, ok: true, game_title, console: platform, method: build.method, planSource: it.planSource, review, rip: dumpKind(platform || ""),
        game_files: game_files.map((f) => {
          const { label, description, accepted_formats, expected_filename, how_provided, drop_into, kind, expected_region, required_version, expected_hashes, expected_size, expected_serial } = f;
          const v = kind === "bios" ? vaultMatch(vaultDir(), f) : null;
          const lib = kind !== "bios" ? findInLibrary(romIndex, f) : null;
          return { label, description, accepted_formats, expected_filename, how_provided, drop_into, kind, expected_region, required_version, expected_hashes, expected_size, expected_serial, vaultPath: v?.path || null, vaultIdentity: v?.identity || null, libraryPath: lib?.path || null, libraryWhy: lib?.why || null };
        }),
      };
    });
  } finally { state.busy = false; }
});

ipcMain.handle("setup", async (e, { items }) => {
  if (kiosk.locked) throw new Error("That is switched off in Kiosk Mode.");
  if (state.busy) throw new Error("Already working.");
  state.busy = true;
  const log = (m) => logTo(e.sender, m);
  log(`--- Set Up Games: ${items.length} item(s)`);
  try {
    const s = loadSettings();
    const mode = s.moveFiles === false ? "copy" : "move";
    const outDir = outDirFor(s, currentTarget(s));
    const jobs = items.map(({ id, picks, verifications, overrides }) => {
      const it = state.pending.get(id);
      if (!it) throw new Error("Read the repos again - the analysis is stale.");
      // Review edits: a different asset from the same release, a different folder name. This run only.
      if (overrides?.asset && overrides.asset !== it.plan.build.release_asset) {
        const ok = (it.ctx.releases || []).some((r) => r.assets.some((a) => a.name === overrides.asset));
        if (!ok) throw new Error(`${overrides.asset} isn't one of this release's downloads.`);
        log(`${it.plan.game_title}: using ${overrides.asset} instead of ${it.plan.build.release_asset} (your choice in Review)`);
        it.plan.build.release_asset = overrides.asset;
      }
      if (overrides?.folder && overrides.folder.trim() && overrides.folder.trim() !== gameFolderName(it.plan)) it.plan.folder_name = overrides.folder.trim();
      return { ...it, picks: picks || {}, verifications: verifications || {} };
    });
    // Updating a game that's already here? Back its saves up first (locations from the published facts).
    const isNew = jobs.map((j) => !fs.existsSync(path.join(outDir, gameFolderName(j.plan), "decomp-buddy.json")));
    for (const j of jobs) {
      const folder = path.join(outDir, gameFolderName(j.plan));
      if (!fs.existsSync(path.join(folder, "decomp-buddy.json"))) continue;
      try { const sv = await savesOf(folder); if (sv.paths.length) await backupSaves(folder, sv.paths, { reason: "before-update", log }); } catch (err) { log(`  couldn't back up saves for ${j.plan.game_title}: ${err.message}`); }
    }
    setupCtrl = new DownloadCtrl();
    const offline = () => new Error("You're offline - setting a game up downloads its build, so it needs the internet. Everything else (Installed Games, Play, Saves, Roll Back, Browse from cache) works now.");
    const out = await setupBatch(jobs, { outDir, mode, log, keep: [...(s.romFolders || []), vaultDir()], ctrl: setupCtrl }).finally(() => { setupCtrl = null; });
    for (const r of out.results) if (!r.ok && /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(r.error || "")) r.error = offline().message;
    out.results.forEach((r, i) => { if (r.ok) state.pending.delete(jobs[i].id); });
    countSetups(jobs.filter((_j, i) => out.results[i]?.ok && isNew[i])); // new games only - an update isn't a new set-up
    const okCount = out.results.filter((r) => r.ok).length;
    if (okCount) { const st = loadSettings(); st.setupCount = (st.setupCount || 0) + okCount; saveSettings(st); out.setupCount = st.setupCount; out.nudgedAt = st.nudgedAt || []; }
    return out;
  } finally { state.busy = false; }
});


// Multi-disc: choose a folder, get each disc assigned to its row (serial, then "Disc N", then name order).
ipcMain.handle("discs:sort", async (e, { id }) => {
  const it = state.pending.get(id); if (!it) throw new Error("Read the repos again - the analysis is stale.");
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: `Folder with the discs for ${it.plan.game_title}`, properties: ["openDirectory"] });
  if (r.canceled) return null;
  return sortDiscs(r.filePaths[0], it.plan.game_files);
});

// Pause / resume / cancel every download in the running set-up.
let setupCtrl = null;
ipcMain.handle("setup:pause", () => { setupCtrl?.pause(); return !!setupCtrl; });
ipcMain.handle("setup:resume", () => { setupCtrl?.resume(); return !!setupCtrl; });
ipcMain.handle("setup:cancel", () => { setupCtrl?.cancel(); return !!setupCtrl; });

// Update installed games without the Set Up screen: Auto Update in the background, and Pick A Version.
// Published install steps only - nothing here spends your AI key. Saves are backed up first, the folder stays
// the same, and a file that doesn't match its malware scan is refused by setup as usual.
// list: [{ folder, repoUrl, target, tag? }] (tag: install that release instead of the published one).
export async function updateInstalled(list, { log = () => {} } = {}) {
  if (state.busy) throw new Error("Already working.");
  state.busy = true;
  try {
    const s = loadSettings(), mode = s.moveFiles === false ? "copy" : "move";
    const published = await fetchPublished({ file: plansFileFor(s), cacheDir: app.getPath("userData") });
    const results = [];
    for (const u of list) {
      try {
        const items = await analyzeBatch([u.repoUrl], { provider: null, log, target: u.target, published, fetchContext: fetchContextFor });
        const ok = items.filter((x) => x.ok);
        const it = ok.find((x) => gameFolderName(x.plan) === path.basename(u.folder)) || (ok.length === 1 ? ok[0] : null);
        if (!it) throw new Error(items.find((x) => !x.ok)?.error || "Couldn't match this game to its published install steps.");
        it.plan.folder_name = path.basename(u.folder);
        if (u.tag && u.tag !== it.plan.build.release_tag) {
          const rel = (it.ctx.releases || []).find((r) => r.tag === u.tag), asset = rel && matchAsset(it.plan.build.release_asset, it.plan.build.release_tag, rel.assets);
          if (!asset) throw new Error(`${u.tag} has no download like ${it.plan.build.release_asset}.`);
          Object.assign(it.plan.build, { release_tag: u.tag, release_asset: asset.name }); delete it.plan.build.scanned; // an older file Decomp Buddy hasn't scanned
          log(`${it.plan.game_title}: installing ${u.tag} (${asset.name}) - not scanned by Decomp Buddy.`);
        }
        try { const sv = await savesOf(u.folder); if (sv.paths.length) await backupSaves(u.folder, sv.paths, { reason: "before-update", log }); } catch (err) { log(`  couldn't back up saves: ${err.message}`); }
        const out = await setupBatch([{ ...it, picks: {}, verifications: {} }], { outDir: path.dirname(u.folder), mode, log, keep: [...(s.romFolders || []), vaultDir()] });
        results.push({ folder: u.folder, ok: !!out.results[0]?.ok, error: out.results[0]?.error || null, tag: it.plan.build.release_tag });
      } catch (err) { results.push({ folder: u.folder, ok: false, error: err.message }); }
    }
    return results;
  } finally { state.busy = false; }
}
