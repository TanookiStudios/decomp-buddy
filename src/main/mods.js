// Moved out of main.js unchanged (2026-09-23): mods IPC handlers.
import { BrowserWindow, ipcMain, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { listMods, addModFile, downloadPack, setModEnabled, packLinks, applyOrder, findConflicts, modsDir, baseName, resyncEnabled } from "../mods.js";
import { searchGames, listMods as gbList, modFiles, KNOWN_GAMES } from "../gamebanana.js";
import { upgradeManifest, readManifests } from "../installhtml.js";
import { logTo, state, loadSettings, saveSettings, diskCache, libraryDirs } from "./core.js";

// ---------- Mods ----------
const manifestOf = (folder) => upgradeManifest(JSON.parse(fs.readFileSync(path.join(folder, "decomp-buddy.json"), "utf8")));
ipcMain.handle("mods:list", (_e, { folder }) => { const m = manifestOf(folder); const cg = state.catalogGames.find((g) => g.owner && `${g.owner}/${g.repo}`.toLowerCase() === String(m.repo).toLowerCase()); return { mods: m.plan.mods, texturesUrl: cg?.texturesUrl || "", items: listMods(folder, m.plan.mods) }; });
ipcMain.handle("mods:add", async (e, { folder }) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: "Choose a mod or texture pack", properties: ["openFile", "multiSelections"] });
  if (r.canceled) return [];
  return r.filePaths.map((f) => addModFile(folder, f));
});
ipcMain.handle("mods:packLinks", (_e, { url }) => packLinks(url));
ipcMain.handle("mods:download", async (e, { folder, url, pageUrl }) => {
  const dest = await downloadPack(folder, url, { log: (m) => logTo(e.sender, m) });
  // Remember the page it came from, so a newer pack there can be offered later.
  if (pageUrl) { const m = manifestOf(folder); const file = path.basename(dest); const sources = (m.modSources || []).filter((x) => !(x.source === "page" && x.pageUrl === pageUrl)); let size = null; try { size = fs.statSync(dest).size; } catch {} sources.push({ source: "page", pageUrl, url, file, size, at: new Date().toISOString() }); fs.writeFileSync(path.join(folder, "decomp-buddy.json"), JSON.stringify({ ...m, modSources: sources }, null, 2)); }
  return dest;
});
ipcMain.handle("mods:toggle", (_e, { folder, name, enabled }) => setModEnabled(folder, manifestOf(folder).plan.mods, name, enabled));

// ---------- Load order + conflicts ----------
const writeManifest = (folder, patch) => { const m = manifestOf(folder); Object.assign(m, patch); fs.writeFileSync(path.join(folder, "decomp-buddy.json"), JSON.stringify(m, null, 2)); return m; };
ipcMain.handle("mods:order", (_e, { folder, order }) => { const m = manifestOf(folder); const done = applyOrder(folder, m.plan.mods || {}, order); writeManifest(folder, { modOrder: done }); return done; });
ipcMain.handle("mods:conflicts", (_e, { folder }) => {
  const m = manifestOf(folder), mods = m.plan.mods || {};
  const target = mods.method === "folder" && mods.folder ? path.join(folder, mods.folder) : null;
  // What the game will actually load: the enabled copies for folder ports, everything in Decomp Buddy Mods otherwise.
  const dir = target && fs.existsSync(target) ? target : modsDir(folder);
  if (!fs.existsSync(dir)) return [];
  const items = listMods(folder, mods).filter((it) => (target ? it.enabled : true));
  const paths = items.map((it) => { const live = fs.readdirSync(dir).find((n) => baseName(n) === it.name); return live && path.join(dir, live); }).filter(Boolean);
  return findConflicts(paths);
});

// ---------- GameBanana ----------
const gbCache = diskCache("gamebanana");
const cached = async (key, ms, fn) => { const hit = gbCache.get(key); if (hit && Date.now() - Date.parse(hit.at) < ms) return hit.v; try { const v = await fn(); gbCache.set(key, v); return v; } catch (err) { if (hit) return hit.v; throw err; } };
// Which GameBanana game a repo's mods live under: your choice, then the known list, then nothing (search).
ipcMain.handle("gb:game", async (_e, { repo, title }) => {
  const key = String(repo || "").toLowerCase(); const s = loadSettings();
  const chosen = s.gbGames?.[key] ?? KNOWN_GAMES[key] ?? null;
  const results = chosen ? [] : await cached(`search-${title}`, 86400e3, () => searchGames(title)).catch(() => []);
  return { id: chosen, results };
});
ipcMain.handle("gb:search", (_e, { q }) => cached(`search-${q}`, 86400e3, () => searchGames(q)));
ipcMain.handle("gb:setGame", (_e, { repo, id }) => { const s = loadSettings(); s.gbGames = { ...(s.gbGames || {}), [String(repo).toLowerCase()]: id === null ? null : Number(id) }; saveSettings(s); return true; });
ipcMain.handle("gb:mods", (_e, { gameId, page = 1, sort = "popular" }) => cached(`mods-${gameId}-${sort}-${page}`, 3600e3, () => gbList(gameId, { page, sort })));
ipcMain.handle("gb:mod", (_e, { modId }) => cached(`mod-${modId}`, 3600e3, () => modFiles(modId)));
// Download one file of a mod into Decomp Buddy Mods, check GameBanana's MD5, and remember where it came from.
export async function installGbFile(folder, modId, fileId, log) {
  const mod = await modFiles(modId); const f = mod.files.find((x) => x.id === Number(fileId));
  if (!f) throw new Error("That file isn't on the mod's page any more.");
  if (f.clean === false) throw new Error("GameBanana's virus scan didn't pass this file, so Decomp Buddy won't download it.");
  const check = (file) => { if (!f.md5) return; const md5 = crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex"); if (md5 !== f.md5.toLowerCase()) throw new Error("The download didn't match GameBanana's checksum - try again."); log("  checksum verified (md5, from GameBanana)"); };
  await downloadPack(folder, f.url, { log, name: f.name, check });
  const m = manifestOf(folder);
  const sources = (m.modSources || []).filter((x) => !(x.source === "gamebanana" && x.modId === mod.id));
  sources.push({ source: "gamebanana", modId: mod.id, fileId: f.id, name: mod.name, file: f.name, url: mod.url, author: mod.author, updatedTs: mod.updatedTs, at: new Date().toISOString() });
  writeManifest(folder, { modSources: sources });
  log(`${mod.name} by ${mod.author || "its author"} is in Decomp Buddy Mods.`);
  return { name: mod.name, file: f.name };
}
ipcMain.handle("gb:install", (e, { folder, modId, fileId }) => installGbFile(folder, modId, fileId, (m) => logTo(e.sender, m)));

// ---------- Texture pack / mod updates ----------
// Page packs (portsdr "Textures" pages): the archive we took is gone, or its size changed. GameBanana: the mod was updated.
async function pageUpdate(src) {
  const links = await packLinks(src.pageUrl);
  const same = links.find((l) => l.url === src.url);
  if (!same) { const newer = links.find((l) => l.name !== src.file); return newer ? { url: newer.url, file: newer.name, why: `a new download is on the page: ${newer.name}` } : null; }
  try { const h = await fetch(src.url, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0 decomp-buddy" }, signal: AbortSignal.timeout(15_000) }); const size = Number(h.headers.get("content-length")) || null; if (src.size && size && size !== src.size) return { url: src.url, file: src.file, why: "the pack on the page changed" }; } catch {}
  return null;
}
export async function packUpdates() {
  const out = [];
  for (const dir of libraryDirs(loadSettings())) for (const m of readManifests(dir)) {
    for (const [i, src] of (m.modSources || []).entries()) {
      try {
        if (src.source === "gamebanana") { const mod = await modFiles(src.modId); if (mod.updatedTs && src.updatedTs && mod.updatedTs > src.updatedTs) out.push({ folder: path.join(dir, m.folder), game: m.plan?.game_title, index: i, name: src.name, why: `updated on GameBanana ${new Date(mod.updatedTs * 1000).toLocaleDateString()}` }); }
        else if (src.source === "page") { const u = await pageUpdate(src); if (u) out.push({ folder: path.join(dir, m.folder), game: m.plan?.game_title, index: i, name: src.file, why: u.why, next: u }); }
      } catch {}
    }
  }
  return out;
}
ipcMain.handle("mods:updates", () => packUpdates());
ipcMain.handle("mods:updatePack", async (e, { folder, index }) => {
  const log = (x) => logTo(e.sender, x); const m = manifestOf(folder); const src = m.modSources?.[index]; if (!src) throw new Error("Nothing to update.");
  if (src.source === "gamebanana") { const mod = await modFiles(src.modId); const f = mod.files.find((x) => x.name === src.file) || mod.files[0]; const r = await installGbFile(folder, src.modId, f.id, log); resyncEnabled(folder, m.plan.mods); return r; }
  const u = await pageUpdate(src); if (!u) return { upToDate: true };
  await downloadPack(folder, u.url, { log });
  resyncEnabled(folder, m.plan.mods);
  const sources = [...m.modSources]; sources[index] = { ...src, url: u.url, file: u.file, size: null, at: new Date().toISOString() };
  writeManifest(folder, { modSources: sources });
  return { name: u.file };
});
