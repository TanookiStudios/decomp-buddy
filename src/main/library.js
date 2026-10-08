// Moved out of main.js unchanged (2026-09-23): library IPC handlers.
import { app, BrowserWindow, ipcMain, dialog, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { iconFor } from "../catalog.js";
import { addToVault, removeFromVault } from "../vault.js";
import { steamDir, steamRunning, userConfigDir, installShortcut } from "../steam.js";
import { renderMarkdown, imagesIn } from "../readme.js";
import { readManifests, upgradeManifest } from "../installhtml.js";
import { spawn } from "node:child_process";
import { splitArgs, launchSpec } from "../gametools.js";
import { wineStatus, wineLaunchSpec, prefixFor, installWine, rosettaReady } from "../wine.js";
export const wineDir = () => path.join(app.getPath("userData"), "tools", "wine");
import { vaultDir, logTo, loadSettings, libraryDirs, state, diskCache, isNetworkError } from "./core.js";

// ---------- Library ----------
const ART_NAMES = ["artwork.png", "artwork.jpg", "folder.ico"];
export function findExecutable(dir, hint, platform = process.platform) {
  const want = hint ? String(hint).toLowerCase() : null;
  const walk = (d, depth = 0, out = []) => { if (depth > 3) return out; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (/\.app$/i.test(e.name)) out.push(p); else if (!/^(Source|Game Files|Mods|node_modules|\.)/.test(e.name)) walk(p, depth + 1, out); } else out.push(p); } return out; };
  const files = walk(dir);
  const isExe = (p) => platform === "win32" ? /\.(exe|bat)$/i.test(p) : platform === "darwin" ? /\.app$/i.test(p) || (() => { try { fs.accessSync(p, fs.constants.X_OK); return !/\.(sh|py|txt|json|ini|ico|png|jpg|dll|dylib|so|md|bin|cue|iso)$/i.test(p) && fs.statSync(p).size > 10_000; } catch { return false; } })() : (() => { try { fs.accessSync(p, fs.constants.X_OK); return !/\.(sh|py|txt|json|ini|png|jpg|dll|so|md|bin|cue|iso)$/i.test(p) && !fs.statSync(p).isDirectory(); } catch { return false; } })();
  const exes = files.filter(isExe);
  if (want) { const hit = exes.find((p) => path.basename(p).toLowerCase() === want) || exes.find((p) => path.basename(p).toLowerCase().startsWith(want.replace(/\.(exe|app)$/, ""))); if (hit) return hit; }
  // prefer top level, then shortest path, then non-launcher names
  return exes.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length || (/launcher|setup|uninstall|rexiso|crash/i.test(path.basename(a)) ? 1 : 0) - (/launcher|setup|uninstall|rexiso|crash/i.test(path.basename(b)) ? 1 : 0))[0] || null;
}
ipcMain.handle("library:list", async () => {
  const s = loadSettings();
  const host = process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : "macos";
  const out = [];
  for (const dir of libraryDirs(s)) for (const m of readManifests(dir)) {
    const folder = path.join(dir, m.folder);
    let art = ART_NAMES.map((n) => path.join(folder, n)).find((p) => fs.existsSync(p)) || null;
    if (!art && m.repo) { const cg = state.catalogGames.find((g) => g.owner && `${g.owner}/${g.repo}`.toLowerCase() === String(m.repo).toLowerCase()); if (cg) art = await iconFor(cg, { cacheDir: app.getPath("userData"), preferBoxart: !!s.preferBoxart }); }
    const runsHere = (m.target || "windows") === "windows" ? host === "windows" : (m.target || "").startsWith("macos") ? host === "macos" : host === "linux";
    // A Windows copy on a Mac can still play through Wine (experimental) once Wine is set up.
    const canWine = host === "macos" && (m.target || "windows") === "windows";
    const exe = m.status === "ready" || m.status === "files_needed" ? findExecutable(folder, m.plan?.build?.executable, canWine ? "win32" : process.platform) : null;
    out.push({ key: `${dir}|${m.folder}`, folder, dir, modsSupported: !!m.plan?.mods?.supported, canBuild: m.plan?.build?.method === "source" && runsHere && process.platform !== "win32", buildSteps: m.plan?.build?.build_steps || [], title: m.plan?.game_title || m.folder, console: m.plan?.console || "", repo: m.repo, repoUrl: m.repoUrl, target: m.target || "windows", tag: m.release?.tag || null, status: m.status, setUpAt: m.setUpAt, lastPlayed: m.lastPlayed || null, steamAppId: m.steamAppId || null, adopted: !!m.adopted, launchArgs: m.launchArgs || "", exe, runsHere, canWine, wineReady: canWine && wineStatus(wineDir()).installed,
      art: art ? `data:${art.endsWith(".jpg") ? "image/jpeg" : art.endsWith(".ico") ? "image/x-icon" : "image/png"};base64,${fs.readFileSync(art).toString("base64")}` : null,
      filesNeeded: (m.plan?.game_files || []).filter((f) => !f.placed).length });
  }
  return out.sort((a, b) => (b.lastPlayed || b.setUpAt || "").localeCompare(a.lastPlayed || a.setUpAt || ""));
});
function stampManifest(folder, patch) {
  const file = path.join(folder, "decomp-buddy.json");
  const m = upgradeManifest(JSON.parse(fs.readFileSync(file, "utf8")));
  Object.assign(m, patch);
  fs.writeFileSync(file, JSON.stringify(m, null, 2));
}
ipcMain.handle("game:play", (e, { folder }) => {
  const m = upgradeManifest(JSON.parse(fs.readFileSync(path.join(folder, "decomp-buddy.json"), "utf8")));
  const viaWine = process.platform === "darwin" && (m.target || "windows") === "windows";
  const exe = findExecutable(folder, m.plan?.build?.executable, viaWine ? "win32" : process.platform);
  if (!exe) throw new Error("Couldn't find the game's executable in that folder.");
  const args = splitArgs(m.launchArgs);
  // With save sync on, wait for the game to close, then copy its saves up.
  const sync = !!loadSettings().syncDir;
  let spec;
  if (viaWine) {
    const w = wineStatus(wineDir()); if (!w.installed) throw new Error("This is the Windows version. To try it on this Mac, set up Wine first (Settings → Windows Games On This Mac).");
    spec = wineLaunchSpec(w.bin, exe, { args, prefix: prefixFor(path.join(app.getPath("userData"), "wine", "prefixes"), folder) });
  } else spec = launchSpec(exe, { args, wait: sync });
  const { cmd, argv, opts } = spec;
  // Test harness (scripts/smoke.sh): never start a real program on the machine running the tests.
  if (process.env.DECOMP_NO_LAUNCH) { logTo(e.sender, `(test run: would start ${cmd} ${argv.join(" ")})`); return { exe, dryRun: true, cmd, argv }; }
  logTo(e.sender, `--- Play${viaWine ? " (Wine)" : ""}: ${exe}${args.length ? ` ${args.join(" ")}` : ""}`);
  const child = spawn(cmd, argv, { ...opts, detached: true, stdio: "ignore" });
  child.on("error", (err) => logTo(e.sender, `Couldn't start ${path.basename(exe)}: ${err.message}`));
  if (sync) child.on("exit", () => { import("./game.js").then((g) => g.pushSaves(folder, { reason: "after-play", log: (x) => logTo(e.sender, x) })).catch((err) => logTo(e.sender, `Save sync skipped: ${err.message}`)); });
  else child.unref();
  stampManifest(folder, { lastPlayed: new Date().toISOString() });
  return { exe };
});
ipcMain.handle("game:steam", async (e, { folder }) => {
  const root = steamDir();
  if (!root) throw new Error("Steam isn't installed on this computer (or has never been signed in).");
  if (steamRunning()) throw new Error("Quit Steam first - it overwrites its shortcuts file when it exits.");
  const cfg = userConfigDir(root);
  if (!cfg) throw new Error("No Steam user folder found - sign in to Steam once, quit it, then try again.");
  const m = upgradeManifest(JSON.parse(fs.readFileSync(path.join(folder, "decomp-buddy.json"), "utf8")));
  const exe = findExecutable(folder, m.plan?.build?.executable);
  if (!exe) throw new Error("Couldn't find the game's executable in that folder.");
  const artFile = ART_NAMES.map((n) => path.join(folder, n)).find((p) => fs.existsSync(p));
  const artwork = {};
  if (artFile) {
    const img = nativeImage.createFromPath(artFile);
    if (!img.isEmpty()) {
      const { width, height } = img.getSize();
      artwork.portrait = (height >= width ? img.resize({ height: 900 }) : img.resize({ width: 600 })).toPNG();
      artwork.square = img.resize({ width: 512, height: 512 }).toPNG();
      artwork.hero = img.resize({ width: 1920 }).toPNG();
    }
  }
  const r = installShortcut({ configDir: cfg, appName: m.plan?.game_title || m.folder, exe, startDir: path.dirname(exe), iconPath: artFile || "", launchOptions: m.launchArgs || "", artwork });
  stampManifest(folder, { steamAppId: r.appid });
  logTo(e.sender, `--- Steam: ${m.plan?.game_title} → ${r.file} (appid ${r.appid})`);
  return r;
});
// Game detail: README + screenshots + last release notes, rendered safely in the main process.
const detailCache = new Map();
ipcMain.handle("game:detail", async (_e, { owner, repo, host }) => {
  const cacheKey = `${host || "github"}:${owner}/${repo}`.toLowerCase();
  const key = `${owner}/${repo}`; // the API path - no host prefix
  if (detailCache.has(cacheKey)) return detailCache.get(cacheKey);
  try { const out = await gameDetailLive(owner, repo, host, key); detailCache.set(cacheKey, out); detailDisk.set(cacheKey, out); return out; }
  catch (err) { const hit = isNetworkError(err) && detailDisk.get(cacheKey); if (hit) return { ...hit.v, offlineFrom: hit.at }; throw isNetworkError(err) ? new Error("You're offline, and this game's page hasn't been opened on this computer before.") : err; }
});
const detailDisk = diskCache("detail");
async function gameDetailLive(owner, repo, host, key) {
  if (host === "gitlab") {
    const { fetchRepoContext: fetchGitLab } = await import("../gitlab.js");
    const ctx = await fetchGitLab({ owner, repo });
    const base = `${ctx.rawBase}README.md`;
    const out = { readme: renderMarkdown(ctx.readme, { base }), screenshots: imagesIn(ctx.readme, { base }).slice(0, 12), releases: ctx.releases.slice(0, 30).map((r) => ({ tag: r.tag, name: r.name, at: r.publishedAt, url: r.url, prerelease: false, notes: "" })), stars: 0, description: ctx.description, homepage: "", archived: false, pushedAt: "" };
    return out;
  }
  const h = { "User-Agent": "decomp-buddy", Accept: "application/vnd.github+json" };
  const meta = await (await fetch(`https://api.github.com/repos/${key}`, { headers: h })).json().catch(() => ({}));
  const branch = meta.default_branch || "main";
  const base = `https://github.com/${key}/blob/${branch}/README.md`;
  const md = await (await fetch(`https://api.github.com/repos/${key}/readme`, { headers: { ...h, Accept: "application/vnd.github.raw+json" } })).text().catch(() => "");
  const rels = await (await fetch(`https://api.github.com/repos/${key}/releases?per_page=30`, { headers: h })).json().catch(() => []);
  const out = {
    readme: renderMarkdown(md, { base }), screenshots: imagesIn(md, { base }).slice(0, 12),
    releases: (Array.isArray(rels) ? rels : []).filter((r) => !r.draft).map((r) => ({ tag: r.tag_name, name: r.name || r.tag_name, at: r.published_at, url: r.html_url, prerelease: r.prerelease, notes: renderMarkdown(r.body || "", { base }) })),
    stars: meta.stargazers_count || 0, description: meta.description || "", homepage: meta.homepage || "", archived: !!meta.archived, pushedAt: meta.pushed_at || "",
  };
  return out;
}
ipcMain.handle("vault:add", async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: "Choose a BIOS / system file", properties: ["openFile"] });
  if (r.canceled) return null;
  return addToVault(vaultDir(), r.filePaths[0]);
});
ipcMain.handle("vault:remove", (_e, { id }) => { removeFromVault(vaultDir(), id); return true; });

// ---- Windows games on this Mac (Wine, experimental)
let wineCtrl = null;
ipcMain.handle("wine:status", async () => ({ supported: process.platform === "darwin", ...wineStatus(wineDir()), rosetta: process.platform === "darwin" ? rosettaReady() : true }));
ipcMain.handle("wine:install", async (e) => {
  if (process.platform !== "darwin") throw new Error("Wine is only needed on a Mac.");
  if (!rosettaReady()) throw new Error("Wine needs Rosetta 2. Install it once: open Terminal and run  softwareupdate --install-rosetta  then try again.");
  if (wineCtrl) throw new Error("Wine is already downloading.");
  const { DownloadCtrl, download } = await import("../setup.js");
  wineCtrl = new DownloadCtrl();
  try { return await installWine(wineDir(), { download, ctrl: wineCtrl, log: (m) => logTo(e.sender, m) }); }
  finally { wineCtrl = null; }
});
ipcMain.handle("wine:cancel", () => { wineCtrl?.cancel(); return true; });
ipcMain.handle("wine:remove", async () => { const { shell } = await import("electron"); if (fs.existsSync(wineDir())) await shell.trashItem(wineDir()); return true; });

// Decomp Buddy itself in Steam, opening in Couch Mode: on a Steam Deck that makes it a tile in Gaming
// Mode you drive with the controller. The installed app only (a dev run would add Electron).
export function selfExecutable(env = process.env) {
  if (env.APPIMAGE) return env.APPIMAGE;                                      // Linux AppImage (Steam Deck)
  if (env.PORTABLE_EXECUTABLE_FILE) return env.PORTABLE_EXECUTABLE_FILE;      // Windows portable
  return process.execPath;                                                    // installed Mac / Windows / .deb
}
ipcMain.handle("steam:addSelf", async (e) => {
  if (!app.isPackaged) throw new Error("Only the installed Decomp Buddy can add itself to Steam.");
  const root = steamDir(); if (!root) throw new Error("Steam isn't installed on this computer (or has never been signed in).");
  if (steamRunning()) throw new Error("Quit Steam first - it overwrites its shortcuts file when it exits.");
  const cfg = userConfigDir(root); if (!cfg) throw new Error("No Steam user folder found - sign in to Steam once, quit it, then try again.");
  const exe = selfExecutable();
  const icon = path.join(app.getAppPath(), "renderer", "icon.png");
  const img = nativeImage.createFromPath(icon);
  const artwork = img.isEmpty() ? {} : { square: img.resize({ width: 512, height: 512 }).toPNG(), portrait: img.resize({ width: 600, height: 600 }).toPNG() };
  const r = installShortcut({ configDir: cfg, appName: "Decomp Buddy", exe, startDir: path.dirname(exe), iconPath: fs.existsSync(icon) ? icon : "", launchOptions: "--couch", tags: ["Decomp Buddy"], artwork });
  logTo(e.sender, `--- Steam: Decomp Buddy (Couch Mode) → ${r.file} (appid ${r.appid})`);
  return { updated: r.updated };
});
