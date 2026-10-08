// Mods and texture packs, per game, the way that game's own docs say. Everything lives
// under <game>/Decomp Buddy Mods/ (not "mods" - many ports own that name): downloads/ for packs fetched from a page, and the files themselves.
// Folder-method ports get files copied into their mods folder (disabled ones parked in
// <folder>/disabled/); in-app/drag ports keep them in Mods/ with the project's instruction.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import AdmZip from "adm-zip";
import { download, extractZip } from "./setup.js";
import { path7za } from "./archive.js";

// Load order: enabled copies in a folder-method port's mods folder can carry "01 - " so the game
// (which reads the folder alphabetically) loads them in the order you set. Names shown without it.
const ORDER_RE = /^\d{2} - /;
export const baseName = (n) => n.replace(ORDER_RE, "");

export const MOD_EXT = /\.(rtz|nrm|otr|o2r|zip|7z|pak|mod|rar|hts|htc|txz|zst|pk3|wad|ips|bps|ups|xdelta)$/i;
const ARCHIVE = /\.(zip|7z|rar)$/i;
// A mod item is a file with a mod-ish extension, or a folder (unpacked PNG texture packs and the like).
const isItem = (dir, n, formats) => !n.startsWith(".") && n !== "downloads" && n !== "disabled" && (fs.statSync(path.join(dir, n)).isDirectory() || MOD_EXT.test(n) || formats.some((f) => n.toLowerCase().endsWith(f.toLowerCase())));

// Direct file links on a texture-pack page (evilgames.eu-style pages list .7z/.zip downloads).
export async function packLinks(pageUrl) {
  const res = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0 decomp-buddy" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${pageUrl} answered ${res.status}`);
  const html = await res.text();
  const out = new Map();
  for (const m of html.matchAll(/href=["']([^"']+\.(?:7z|zip|rtz|nrm|otr|o2r|rar))["']/gi)) {
    try { const u = new URL(m[1], pageUrl).href; out.set(u, { url: u, name: decodeURIComponent(u.split("/").pop()) }); } catch {}
  }
  return [...out.values()];
}

export function modsDir(gameFolder) { return path.join(gameFolder, "Decomp Buddy Mods"); }

// What's in the Mods folder (and, for folder-method ports, what's enabled in the game's own folder).
export function listMods(gameFolder, mods = {}) {
  const dir = modsDir(gameFolder);
  const formats = mods.formats || [];
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => isItem(dir, n, formats)) : [];
  const target = mods.method === "folder" && mods.folder ? path.join(gameFolder, mods.folder) : null;
  const enabledRaw = target && fs.existsSync(target) ? fs.readdirSync(target).filter((n) => isItem(target, n, formats)) : [];
  const enabled = new Set(enabledRaw.map(baseName));
  const orderOf = new Map(enabledRaw.filter((n) => ORDER_RE.test(n)).map((n) => [baseName(n), Number(n.slice(0, 2))]));
  const disabledDir = target && path.join(target, "disabled");
  const disabled = new Set(disabledDir && fs.existsSync(disabledDir) ? fs.readdirSync(disabledDir).filter((n) => !n.startsWith(".")).map(baseName) : []);
  const all = new Set([...files, ...enabled, ...disabled]);
  return [...all].sort((a, b) => (orderOf.get(a) ?? 99) - (orderOf.get(b) ?? 99) || a.localeCompare(b)).map((name) => ({ name, enabled: target ? enabled.has(name) : null, inMods: files.includes(name), ...(orderOf.has(name) ? { order: orderOf.get(name) } : {}) }));
}

export function addModFile(gameFolder, file) {
  const dir = modsDir(gameFolder); fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, path.basename(file));
  fs.copyFileSync(file, dest);
  return dest;
}

export async function downloadPack(gameFolder, url, { log = () => {}, name: given = null, check = null } = {}) {
  const dir = path.join(modsDir(gameFolder), "downloads"); fs.mkdirSync(dir, { recursive: true });
  const name = (given || decodeURIComponent(url.split("/").pop().split("?")[0]) || "pack").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  const dest = path.join(dir, name);
  log(`Downloading ${name}…`);
  await download(url, dest, log);
  if (check) { try { check(dest); } catch (err) { fs.rmSync(dest, { force: true }); throw err; } }
  return unpackIntoMods(gameFolder, dest, { log });
}
// Archives: unpack, then hand the contents over as items - single mod files become files,
// anything else (PNG packs, multi-file packs) becomes one folder item named after the archive.
export function unpackIntoMods(gameFolder, dest, { log = () => {} } = {}) {
  const dir = path.dirname(dest), name = path.basename(dest);
  if (ARCHIVE.test(name)) {
    const unpacked = path.join(dir, name.replace(ARCHIVE, ""));
    try { const n = extractZip(dest, unpacked); log(`Unpacked ${n} item(s).`); } catch (err) { log(`Left packed (${err.message}).`); return dest; }
    const all = walk(unpacked);
    const modFiles = all.filter((f) => MOD_EXT.test(f) && !ARCHIVE.test(f));
    if (modFiles.length && modFiles.length === all.filter((f) => !/\.(txt|md|nfo|url)$/i.test(f)).length) for (const f of modFiles) fs.copyFileSync(f, path.join(modsDir(gameFolder), path.basename(f)));
    else { const item = path.join(modsDir(gameFolder), path.basename(unpacked)); fs.rmSync(item, { recursive: true, force: true }); fs.cpSync(unpacked, item, { recursive: true }); }
  } else fs.copyFileSync(dest, path.join(modsDir(gameFolder), name));
  return dest;
}

// After a pack update: enabled copies in the port's mods folder are refreshed from Decomp Buddy Mods.
export function resyncEnabled(gameFolder, mods) {
  if (mods?.method !== "folder" || !mods.folder) return 0;
  const target = path.join(gameFolder, mods.folder); if (!fs.existsSync(target)) return 0;
  let n = 0;
  for (const live of fs.readdirSync(target)) {
    const src = path.join(modsDir(gameFolder), baseName(live));
    if (live === "disabled" || !fs.existsSync(src)) continue;
    fs.rmSync(path.join(target, live), { recursive: true, force: true }); fs.cpSync(src, path.join(target, live), { recursive: true }); n++;
  }
  return n;
}

// Put enabled mods in the order given (names without prefixes), by renaming their copies in the
// port's mods folder "01 - …", "02 - …". Only copies are renamed; the originals in Decomp Buddy Mods stay.
export function applyOrder(gameFolder, mods, order) {
  if (mods.method !== "folder" || !mods.folder) throw new Error("This port loads mods from inside the game - set the order there.");
  const target = path.join(gameFolder, mods.folder);
  const live = fs.existsSync(target) ? fs.readdirSync(target).filter((n) => isItem(target, n, mods.formats || [])) : [];
  const byBase = new Map(live.map((n) => [baseName(n), n]));
  const ordered = [...order.filter((n) => byBase.has(n)), ...[...byBase.keys()].filter((n) => !order.includes(n)).sort()];
  ordered.forEach((n, i) => { const want = `${String(i + 1).padStart(2, "0")} - ${n}`; const have = byBase.get(n); if (have !== want) fs.renameSync(path.join(target, have), path.join(target, want)); });
  return ordered;
}

// What files each mod replaces, so two that touch the same file can be flagged. Zip-format packs
// (.zip, .o2r, .otr, .rtz and most others) are read directly; 7z/rar through 7-Zip; folders walked.
export function entriesOf(p) {
  const st = fs.statSync(p);
  const norm = (e) => e.replace(/\\/g, "/").replace(/^\.?\//, "").toLowerCase();
  if (st.isDirectory()) return walk(p).map((f) => norm(path.relative(p, f)));
  const head = Buffer.alloc(4); const fd = fs.openSync(p, "r"); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
  if (head.toString("latin1", 0, 2) === "PK") { try { return new AdmZip(p).getEntries().filter((e) => !e.isDirectory).map((e) => norm(e.entryName)); } catch { return []; } }
  if (/\.(7z|rar)$/i.test(p)) {
    try { const out = execFileSync(path7za(), ["l", "-slt", "-ba", p], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); return out.split(/\r?\n\r?\n/).filter((b) => /Attributes = [^D]*$/m.test(b) && !/Folder = \+/.test(b)).map((b) => norm((b.match(/^Path = (.*)$/m) || [])[1] || "")).filter(Boolean); } catch { return []; }
  }
  return [];
}
// [{ a, b, count, sample }] for each pair of the given mod paths that replace the same files.
export function findConflicts(paths) {
  const owners = new Map();
  for (const p of paths) for (const e of new Set(entriesOf(p))) { if (/(^|\/)(readme|license|credits|changelog)[^/]*$|\.(txt|md|url|nfo)$/i.test(e)) continue; if (!owners.has(e)) owners.set(e, []); owners.get(e).push(path.basename(p)); }
  const pairs = new Map();
  for (const [e, who] of owners) for (let i = 0; i < who.length; i++) for (let j = i + 1; j < who.length; j++) { const k = `${who[i]}\u0000${who[j]}`; if (!pairs.has(k)) pairs.set(k, []); pairs.get(k).push(e); }
  return [...pairs.entries()].map(([k, es]) => { const [a, b] = k.split("\u0000"); return { a: baseName(a), b: baseName(b), count: es.length, sample: es.slice(0, 5) }; }).sort((x, y) => y.count - x.count);
}
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };

// Enable/disable for folder-method ports; for the rest there's nothing to toggle - the game does it.
export function setModEnabled(gameFolder, mods, name, enabled) {
  if (mods.method !== "folder" || !mods.folder) throw new Error("This port installs mods from inside the game - use its mod menu.");
  const target = path.join(gameFolder, mods.folder), parked = path.join(target, "disabled");
  fs.mkdirSync(parked, { recursive: true });
  const live = fs.existsSync(target) ? fs.readdirSync(target).find((n) => baseName(n) === name) : null;
  const src = enabled ? [path.join(parked, name), path.join(modsDir(gameFolder), name)].find((p) => fs.existsSync(p)) : live && path.join(target, live);
  if (!src || !fs.existsSync(src)) throw new Error(`${name} not found.`);
  const dest = enabled ? path.join(target, name) : path.join(parked, name);
  fs.rmSync(dest, { recursive: true, force: true });
  if (src.startsWith(modsDir(gameFolder))) fs.cpSync(src, dest, { recursive: true }); else fs.renameSync(src, dest);
  return true;
}
