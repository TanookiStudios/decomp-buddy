// Moved out of main.js unchanged (2026-09-23): library IPC handlers.
import { app, BrowserWindow, ipcMain, dialog, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { iconFor } from "../catalog.js";
import { targetIsHost, TARGETS } from "../targets.js";
import { addToVault, removeFromVault } from "../vault.js";
import { steamDir, steamRunning, userConfigDir, installShortcut } from "../steam.js";
import { renderMarkdown, imagesIn } from "../readme.js";
import { readManifests, upgradeManifest } from "../installhtml.js";
import { spawn } from "node:child_process";
import { splitArgs, launchSpec, findExecutable } from "../gametools.js";
export { findExecutable };
import { wineStatus, wineLaunchSpec, prefixFor, installWine, rosettaReady } from "../wine.js";
import { findRunners, compatLaunchSpec, pickRunner, umuPath } from "../proton.js";
export const wineDir = () => path.join(app.getPath("userData"), "tools", "wine");
const prefixesDir = () => path.join(app.getPath("userData"), "wine", "prefixes");
// Windows builds on a Mac (Decomp Buddy's own Wine) or on Linux (Proton from Steam, umu-run, or Wine). Looked up once a minute at most.
let runnersAt = 0, runnersCache = [];
export function linuxRunners() { if (Date.now() - runnersAt > 60_000) { runnersCache = findRunners({ steamRoot: steamDir() }); runnersAt = Date.now(); } return runnersCache; }
const compatHost = (m) => process.platform !== "win32" && (m.target || "windows").startsWith("windows");
const compatReady = () => (process.platform === "darwin" ? wineStatus(wineDir()).installed : linuxRunners().length > 0);
import { vaultDir, logTo, loadSettings, libraryDirs, state, diskCache, isNetworkError } from "./core.js";

// ---------- Library ----------
const ART_NAMES = ["artwork.png", "artwork.jpg", "folder.ico"];
// Every installed game, newest-played first (the Installed screen, and Phone Link).
export async function listLibrary() {
  const s = loadSettings();
  const out = [];
  let ready = null; // phone/headset serials plugged in, looked up once and only when there's a device game
  for (const dir of libraryDirs(s)) for (const m of readManifests(dir)) {
    const onDevice = TARGETS[m.target]?.kind === "device";
    if (onDevice && !ready) ready = await (await import("./devices.js")).readySerials();
    const folder = path.join(dir, m.folder);
    let art = ART_NAMES.map((n) => path.join(folder, n)).find((p) => fs.existsSync(p)) || null;
    if (!art && m.repo) { const cg = state.catalogGames.find((g) => g.owner && `${g.owner}/${g.repo}`.toLowerCase() === String(m.repo).toLowerCase()); if (cg) art = await iconFor(cg, { cacheDir: app.getPath("userData"), preferBoxart: !!s.preferBoxart }); }
    const runsHere = targetIsHost(m.target || "windows");
    // A Windows copy on a Mac can still play through Wine (experimental) once Wine is set up.
    const canWine = compatHost(m);
    const exe = m.status === "ready" || m.status === "files_needed" ? findExecutable(folder, m.plan?.build?.executable, canWine ? "win32" : process.platform) : null;
    out.push({ key: `${dir}|${m.folder}`, folder, dir, modsSupported: !!m.plan?.mods?.supported, canBuild: m.plan?.build?.method === "source" && runsHere && process.platform !== "win32", buildSteps: m.plan?.build?.build_steps || [], title: m.displayName || m.plan?.game_title || m.folder, originalTitle: m.plan?.game_title || m.folder, tags: Array.isArray(m.tags) ? m.tags : [], hidden: !!m.hidden, autoUpdate: m.autoUpdate ?? null, skipTag: m.skipTag || null, console: m.plan?.console || "", repo: m.repo, repoUrl: m.repoUrl, target: m.target || "windows", tag: m.release?.tag || null, status: m.status, setUpAt: m.setUpAt, lastPlayed: m.lastPlayed || null, steamAppId: m.steamAppId || null, adopted: !!m.adopted, launchArgs: m.launchArgs || "", exe, runsHere, canWine, wineReady: canWine && compatReady(), compatName: process.platform === "darwin" ? "Wine" : (pickRunner(linuxRunners(), m.runner)?.kind === "wine" ? "Wine" : "Proton"), runner: m.runner || null,
      art: art ? `data:${art.endsWith(".jpg") ? "image/jpeg" : art.endsWith(".ico") ? "image/x-icon" : "image/png"};base64,${fs.readFileSync(art).toString("base64")}` : null,
      filesNeeded: (m.plan?.game_files || []).filter((f) => !f.placed).length,
      ...(onDevice ? { onDevice: true, device: m.device || null, packageId: m.package_id || null, deviceReady: !!m.device && ready.has(m.device.serial) } : {}) });
  }
  return out.sort((a, b) => (b.lastPlayed || b.setUpAt || "").localeCompare(a.lastPlayed || a.setUpAt || ""));
}
ipcMain.handle("library:list", () => listLibrary());
function stampManifest(folder, patch) {
  const file = path.join(folder, "decomp-buddy.json");
  const m = upgradeManifest(JSON.parse(fs.readFileSync(file, "utf8")));
  Object.assign(m, patch);
  fs.writeFileSync(file, JSON.stringify(m, null, 2));
}
ipcMain.handle("game:play", async (e, { folder }) => {
  // A phone/headset game's Play starts it on the device.
  const t = (() => { try { return upgradeManifest(JSON.parse(fs.readFileSync(path.join(folder, "decomp-buddy.json"), "utf8"))).target; } catch { return null; } })();
  return TARGETS[t]?.kind === "device" ? (await import("./devices.js")).launchOnDevice(folder) : playGame(e.sender, folder);
});
// A desktop shortcut's decompbuddy://play link: only with this install's key, and only for a game in the Library.
export async function playFromShortcut(win, { folder, key }) {
  const s = loadSettings();
  if (!s.shortcutKey || key !== s.shortcutKey) return;
  const { libraryFolder } = await import("./game.js");
  try { playGame(win.webContents, libraryFolder(folder)); } catch (err) { logTo(win.webContents, `Shortcut: ${err.message}`); }
}
// Games started from here that haven't closed yet (Auto Update never touches one while it runs).
export const runningGames = new Set();
export function playGame(sender, folder) {
  const e = { sender };
  const m = upgradeManifest(JSON.parse(fs.readFileSync(path.join(folder, "decomp-buddy.json"), "utf8")));
  const viaWine = compatHost(m);
  const exe = findExecutable(folder, m.plan?.build?.executable, viaWine ? "win32" : process.platform);
  if (!exe) throw new Error("Couldn't find the game's executable in that folder.");
  const args = splitArgs(m.launchArgs);
  // With save sync on, wait for the game to close, then copy its saves up.
  const sync = !!loadSettings().syncDir;
  let spec;
  let via = "";
  if (viaWine && process.platform === "darwin") {
    const w = wineStatus(wineDir()); if (!w.installed) throw new Error("This is the Windows version. To try it on this Mac, set up Wine first (Settings → Windows Games On This Mac).");
    spec = wineLaunchSpec(w.bin, exe, { args, prefix: prefixFor(prefixesDir(), folder) }); via = "Wine";
  } else if (viaWine) {
    const r = pickRunner(linuxRunners(), m.runner);
    if (!r) throw new Error("This is the Windows version. To play it here, install Proton from Steam (Library → search \"Proton\" → Install) or Wine, then try again.");
    spec = compatLaunchSpec(r, exe, { args, prefix: prefixFor(prefixesDir(), folder), steamRoot: steamDir(), umu: r.kind === "proton" ? umuPath() : null }); via = r.label;
  } else spec = launchSpec(exe, { args, wait: sync });
  const { cmd, argv, opts } = spec;
  // Test harness (scripts/smoke.sh): never start a real program on the machine running the tests.
  if (process.env.DECOMP_NO_LAUNCH) { logTo(e.sender, `(test run: would start ${cmd} ${argv.join(" ")})`); return { exe, dryRun: true, cmd, argv }; }
  logTo(e.sender, `--- Play${via ? ` (${via})` : ""}: ${exe}${args.length ? ` ${args.join(" ")}` : ""}`);
  // What the game prints goes to a log beside it, so a game that won't start can say why.
  const logPath = path.join(folder, "decomp-buddy-launch.log");
  let out = "ignore";
  try { out = fs.openSync(logPath, "w"); fs.writeSync(out, `Decomp Buddy started ${cmd} ${argv.join(" ")}\n${new Date().toISOString()}\n\n`); } catch {}
  const child = spawn(cmd, argv, { ...opts, detached: true, stdio: ["ignore", out, out] });
  if (typeof out === "number") fs.closeSync(out);
  const startedAt = Date.now();
  runningGames.add(folder); child.on("exit", () => runningGames.delete(folder));
  child.on("error", (err) => logTo(e.sender, `Couldn't start ${path.basename(exe)}: ${err.message}`));
  child.on("exit", (code, signal) => {
    if ((code === 0 && !signal) || Date.now() - startedAt > 30_000) return;
    const tail = (() => { try { return fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean).slice(-12).join("\n"); } catch { return ""; } })();
    logTo(e.sender, `${path.basename(exe)} closed right away (${signal || `exit code ${code}`}). Its output is in ${logPath}.`);
    if (!e.sender.isDestroyed()) e.sender.send("game:failed", { folder, title: m.displayName || m.plan?.game_title || m.folder, code, signal, tail, logPath });
  });
  if (sync) child.on("exit", () => { import("./game.js").then((g) => g.pushSaves(folder, { reason: "after-play", log: (x) => logTo(e.sender, x) })).catch((err) => logTo(e.sender, `Save sync skipped: ${err.message}`)); });
  else child.unref();
  stampManifest(folder, { lastPlayed: new Date().toISOString() });
  return { exe };
}
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
  if (host && host !== "github") {
    const { fetchContextFor } = await import("../hosts.js");
    const ctx = await fetchContextFor({ host, owner, repo });
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
ipcMain.handle("compat:runners", () => (process.platform === "linux" ? linuxRunners().map(({ id, kind, label }) => ({ id, kind, label })) : []));
ipcMain.handle("compat:setRunner", async (_e, { folder, runner }) => { const { libraryFolder } = await import("./game.js"); stampManifest(libraryFolder(folder), { runner: runner || undefined }); return true; });
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
