// Phone Link: Decomp Buddy Remote (the iPhone app) controls this copy over the home network. Off until switched on in
// Settings → Phone; pairing is the QR code there (address + the key every message is sealed with, see phonecrypto.js).
// The phone never downloads a game: Install hands the game to this app's normal Set Up flow, the same as clicking Add.
import { app, ipcMain, BrowserWindow } from "electron";
import http from "node:http";
import os from "node:os";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { newKey, seal, open } from "../phonecrypto.js";
import { loadSettings, saveSettings, currentTarget, plansFileFor } from "./core.js";
import { listLibrary, playGame } from "./library.js";
import { updateInstalled } from "./setup.js";
import { savesOf, romIndexFile } from "./files.js";
import { backupSaves } from "../saves.js";
import { readIndex, playableFromLibrary } from "../romindex.js";
import { fetchPublished } from "../plans.js";
import { TARGETS } from "../targets.js";

export const PORT = 47613;
const seen = new Map(), jobs = new Map();
let server = null;

const lanAddresses = () => Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === "IPv4" && !a.internal).map((a) => a.address);
const mainWindow = () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) || null;
// The name the phone shows. Never the machine's network name (it can carry a person's name): a plain default, or what you typed.
const DEFAULT_NAME = { darwin: "Mac", win32: "Windows PC", linux: "Linux PC" };
const computerName = () => String(loadSettings().phoneLink?.name || "").trim().slice(0, 40) || DEFAULT_NAME[process.platform] || "Computer";
const conf = () => { const s = loadSettings(); return { enabled: !!s.phoneLink?.enabled, key: s.phoneLink?.key || null }; };

// The pairing link the QR code holds; the iPhone app opens decompbuddy:// links.
export function pairingLink(key, hosts = lanAddresses(), name = computerName()) {
  const q = new URLSearchParams({ h: hosts.join(","), p: String(PORT), k: key, n: name });
  return `decompbuddy://pair?${q}`;
}

const job = (patch) => { const id = patch.id || crypto.randomUUID(); const j = { ...(jobs.get(id) || {}), ...patch, id, at: Date.now() }; jobs.set(id, j); return j; };
async function inLibrary(folder) { const g = (await listLibrary()).find((x) => x.folder === folder); if (!g) throw new Error("That game isn't in this computer's library."); return g; }

// Everything the phone can ask for. Each answer is plain data; nothing here returns file contents or settings.
export const METHODS = {
  hello: async () => ({ computer: computerName(), app: app.getVersion(), target: currentTarget(loadSettings()), platform: process.platform }),
  library: async () => (await listLibrary()).map(({ folder, title, console, repo, repoUrl, target, tag, status, lastPlayed, setUpAt, autoUpdate, hidden, onDevice }) => ({ folder, title, console, repo, repoUrl, target, tag, status, lastPlayed, setUpAt, autoUpdate, hidden: !!hidden, onDevice: !!onDevice })),
  wishlist: async () => loadSettings().wishlist || {},
  setWishlist: async ({ wishlist }) => { if (!wishlist || typeof wishlist !== "object" || Array.isArray(wishlist)) throw new Error("bad wishlist"); const s = loadSettings(); s.wishlist = wishlist; saveSettings(s); return true; },
  finder: async ({ target } = {}) => {
    const s = loadSettings(), pub = await fetchPublished({ file: plansFileFor(s), cacheDir: app.getPath("userData") }).catch(() => null);
    return playableFromLibrary(pub, readIndex(romIndexFile()), TARGETS[target] ? target : currentTarget(s)).map((x) => x.id);
  },
  install: async ({ id }) => {
    if (typeof id !== "string" || !/^[a-z]+:[^\s]{3,300}$/i.test(id)) throw new Error("bad game id");
    const w = mainWindow(); if (!w) throw new Error("Open Decomp Buddy on the computer first.");
    const j = job({ kind: "install", game: id, state: "queued", message: "Sent to the computer." });
    w.webContents.send("phone:install", { id, job: j.id });
    return j;
  },
  update: async ({ folder }) => {
    const g = await inLibrary(folder), j = job({ kind: "update", game: g.title, folder, state: "working", message: "Updating…" });
    updateInstalled([{ folder: g.folder, repoUrl: g.repoUrl, target: g.target }])
      .then(([r]) => job({ id: j.id, state: r?.ok ? "done" : "failed", message: r?.ok ? `Updated to ${r.tag}.` : r?.error || "Update failed." }))
      .catch((err) => job({ id: j.id, state: "failed", message: err.message }));
    return j;
  },
  play: async ({ folder }) => {
    const g = await inLibrary(folder);
    if (g.onDevice) { await (await import("./devices.js")).launchOnDevice(g.folder); return true; }
    const w = mainWindow(); if (!w) throw new Error("Open Decomp Buddy on the computer first.");
    await playGame(w.webContents, g.folder); return true;
  },
  backupSaves: async ({ folder }) => { const g = await inLibrary(folder), sv = await savesOf(g.folder); if (!sv.paths.length) throw new Error("No save files found for this game yet."); await backupSaves(g.folder, sv.paths, { reason: "phone" }); return true; },
  jobs: async () => [...jobs.values()].filter((j) => Date.now() - j.at < 3600e3).sort((a, b) => b.at - a.at),
};

// One sealed request in, one sealed answer out. Exported for the tests.
export async function handle(key, env, { now = Date.now() } = {}) {
  let msg;
  try { msg = open(key, env, { now, seen }); } catch { return { status: 401, body: { error: "not paired" } }; }
  const fn = Object.hasOwn(METHODS, msg.m) ? METHODS[msg.m] : null;
  if (!fn) return { status: 200, body: seal(key, { ok: false, error: "unknown request", ts: Date.now() }) };
  try { return { status: 200, body: seal(key, { ok: true, result: await fn(msg.p || {}), ts: Date.now() }) }; }
  catch (err) { return { status: 200, body: seal(key, { ok: false, error: err.message, ts: Date.now() }) }; }
}

// Resolves once listening (or failed), so Settings can say which.
function start() {
  if (server) return Promise.resolve();
  server = http.createServer((req, res) => {
    const send = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.method === "GET" && req.url === "/v1/ping") return send(200, { app: "decomp-buddy", v: 1 });
    if (req.method !== "POST" || req.url !== "/v1") return send(404, { error: "not found" });
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 65536) req.destroy(); });
    req.on("end", async () => { const { key, enabled } = conf(); if (!enabled || !key) return send(403, { error: "off" }); let env; try { env = JSON.parse(raw); } catch { return send(400, { error: "bad json" }); } const r = await handle(key, env); send(r.status, r.body); });
  });
  return new Promise((resolve) => {
    server.once("listening", resolve);
    server.on("error", () => { server = null; resolve(); });   // port taken: Settings shows it as not running
    server.listen(PORT, "0.0.0.0");
  });
}
function stop() { server?.close(); server = null; }
export function startPhoneLink() { if (conf().enabled) start(); }

async function status() {
  const { enabled, key } = conf();
  return { enabled, running: !!server?.listening, port: PORT, computer: computerName(), addresses: lanAddresses(), qr: enabled && key ? await QRCode.toDataURL(pairingLink(key), { margin: 1, width: 280 }) : null };
}
ipcMain.handle("phone:status", () => status());
ipcMain.handle("phone:set", async (_e, { enabled }) => {
  const s = loadSettings(); s.phoneLink = { ...(s.phoneLink || {}), enabled: !!enabled, key: s.phoneLink?.key || newKey() }; saveSettings(s);
  if (enabled) await start(); else stop();
  return status();
});
// Forget every paired phone: a new key, so the old QR code stops working.
ipcMain.handle("phone:name", (_e, { name }) => { const s = loadSettings(); s.phoneLink = { ...(s.phoneLink || {}), name: String(name || "").trim().slice(0, 40) }; saveSettings(s); return status(); });
ipcMain.handle("phone:forget", async () => { const s = loadSettings(); s.phoneLink = { ...(s.phoneLink || {}), key: newKey() }; saveSettings(s); seen.clear(); return status(); });
// The Set Up screen reports how a phone's Install is going.
ipcMain.on("phone:job", (_e, patch) => { if (patch?.id && jobs.has(patch.id)) job({ id: patch.id, state: String(patch.state || ""), message: String(patch.message || "").slice(0, 300) }); });
