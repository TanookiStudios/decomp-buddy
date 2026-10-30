// Find My Steam And GOG Games: PC remakes (Fallout CE, RTCW, OpenMW...) need files from the original PC game, which
// most people own on Steam, GOG or Epic. This lists the games those stores installed on this computer and finds the
// files a plan asks for inside the matching one. Read-only: nothing in a store's folder is ever moved or changed
// (setup copies from there - see isStoreInstallPath).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { libraryPaths } from "./proton.js";

const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
const json = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const isDir = (d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } };

// Steam's appmanifest_*.acf: { name, installdir }.
export function parseAcf(text) {
  const get = (k) => String(text || "").match(new RegExp(`"${k}"\\s+"([^"]*)"`, "i"))?.[1] || null;
  return { name: get("name"), installdir: get("installdir") };
}
// `reg query HKLM\SOFTWARE\WOW6432Node\GOG.com\Games /s`: one { name, dir } per game key.
export function parseGogRegistry(text) {
  const out = []; let cur = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    if (/^HKEY_/i.test(line)) { if (cur?.name && cur.dir) out.push(cur); cur = {}; continue; }
    const m = line.match(/^\s+(\w+)\s+REG_\w+\s+(.*)$/); if (!m || !cur) continue;
    if (/^gameName$/i.test(m[1])) cur.name = m[2].trim(); else if (/^path$/i.test(m[1])) cur.dir = m[2].trim();
  }
  if (cur?.name && cur.dir) out.push(cur);
  return out;
}

function steamRoots({ platform, home, env }) {
  if (platform === "win32") return [path.join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"), path.join(env.ProgramFiles || "C:\\Program Files", "Steam")];
  if (platform === "darwin") return [path.join(home, "Library", "Application Support", "Steam")];
  return [path.join(home, ".steam", "steam"), path.join(home, ".local", "share", "Steam"), path.join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam")];
}

// Every game Steam, GOG or Epic installed here: [{ store, name, dir }].
export function installedGames({ platform = process.platform, home = os.homedir(), env = process.env, regQuery = null } = {}) {
  const out = [], seen = new Set(), add = (store, name, dir) => { if (name && dir && isDir(dir) && !seen.has(dir)) { seen.add(dir); out.push({ store, name, dir }); } };
  // Steam: every library in libraryfolders.vdf, then each game's manifest.
  const libs = new Set();
  for (const root of steamRoots({ platform, home, env })) {
    if (isDir(path.join(root, "steamapps"))) libs.add(root);
    for (const p of libraryPaths(read(path.join(root, "steamapps", "libraryfolders.vdf")) || "")) libs.add(p);
  }
  for (const lib of libs) {
    const apps = path.join(lib, "steamapps"); let files = []; try { files = fs.readdirSync(apps); } catch {}
    for (const f of files.filter((n) => /^appmanifest_\d+\.acf$/.test(n))) { const m = parseAcf(read(path.join(apps, f))); if (m.installdir) add("Steam", m.name, path.join(apps, "common", m.installdir)); }
  }
  // GOG on Windows (GOG Galaxy and the offline installers both register here).
  if (platform === "win32") {
    let text = ""; try { text = regQuery ? regQuery() : execFileSync("reg", ["query", "HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games", "/s"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch {}
    for (const g of parseGogRegistry(text)) add("GOG", g.name, g.dir);
    // Epic: one .item JSON per installed game.
    const man = path.join(env.ProgramData || "C:\\ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests"); let items = []; try { items = fs.readdirSync(man); } catch {}
    for (const f of items.filter((n) => n.endsWith(".item"))) { const m = json(path.join(man, f)); add("Epic", m?.DisplayName, m?.InstallLocation); }
  } else {
    // Heroic (GOG and Epic on Linux, Steam Deck and Mac): its own installed lists.
    const heroic = platform === "darwin" ? path.join(home, "Library", "Application Support", "heroic") : path.join(home, ".config", "heroic");
    for (const base of [heroic, path.join(home, ".var", "app", "com.heroicgameslauncher.hgl", "config", "heroic")]) {
      const gog = json(path.join(base, "gog_store", "installed.json"));
      for (const g of gog?.installed || []) add("GOG", g.title || path.basename(g.install_path || ""), g.install_path);
      const epic = json(path.join(base, "legendaryConfig", "legendary", "installed.json"));
      for (const g of Object.values(epic || {})) add("Epic", g?.title, g?.install_path);
    }
    // GOG's Mac installers put games in Applications as "<Game>.app".
    if (platform === "darwin") { let apps = []; try { apps = fs.readdirSync("/Applications"); } catch {} for (const a of apps) if (isDir(path.join("/Applications", a, "Contents", "Resources", "game"))) add("GOG", a.replace(/\.app$/i, ""), path.join("/Applications", a, "Contents", "Resources", "game")); }
  }
  return out;
}

// "Fallout 2: A Post Nuclear Role Playing Game" is Fallout 2; "Fallout 2" is not Fallout. A subtitle after a colon or
// dash is fine; a possessive in front ("Sid Meier's Civilization II") is dropped; anything else must match exactly.
const norm = (t) => String(t || "").toLowerCase().replace(/[™®©]/g, "").replace(/&/g, " and ").replace(/\([^)]*\)/g, " ").replace(/^[\w.]+(?: [\w.]+)?'s /, "").replace(/[^a-z0-9:–-]+/g, " ").replace(/\s+/g, " ").trim();
export function matchInstalls(title, installs) {
  const t = norm(title); if (!t) return [];
  // Store editions of the same game: "Plants vs. Zombies GOTY Edition", "Diablo Gold". Nothing looser.
  const EDITION = /^ (?:goty|game of the year|gold|complete|deluxe|definitive|anniversary|steam)(?: edition)?$/;
  const ok = (n) => n === t || [":", " -", " –", " :"].some((sep) => n.startsWith(t + sep)) || (n.startsWith(t + " ") && EDITION.test(n.slice(t.length)));
  return installs.filter((g) => ok(norm(g.name)));
}
export const matchInstall = (title, installs) => matchInstalls(title, installs)[0] || null;

// The file for one game-file row: a named file from whichever matching install has it; a whole folder only when exactly
// one install matches (DOOM and DOOM (1993) both installed: don't guess which folder).
export function storeFileFor(title, gameFile, installs) {
  const hits = matchInstalls(title, installs);
  if (!gameFile.expected_filename && hits.length !== 1) return null;
  for (const g of hits) { const p = findInInstall(g.dir, gameFile); if (p) return { path: p, store: g.store, name: g.name }; }
  return null;
}

// The file a plan asks for, inside an install: by its exact name (any case, up to 4 folders deep).
// A whole-folder game file without a name is the install itself.
export function findInInstall(dir, gameFile) {
  const want = String(gameFile.expected_filename || "").toLowerCase();
  if (!want) return ["folder", "command_line"].includes(gameFile.how_provided) ? dir : null;
  const stack = [[dir, 0]];
  while (stack.length) {
    const [d, depth] = stack.pop(); let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) { const p = path.join(d, e.name); if (e.name.toLowerCase() === want) return p; if (e.isDirectory() && depth < 4) stack.push([p, depth + 1]); }
  }
  return null;
}

// Never move out of a store's folder (that would break the game in Steam/GOG/Epic): setup copies instead.
export const isStoreInstallPath = (p) => /[\\/]steamapps[\\/]common[\\/]|[\\/]GOG Galaxy[\\/]Games[\\/]|[\\/]GOG Games[\\/]|[\\/]Epic Games[\\/]|[\\/]heroic[\\/]|[\\/]Games[\\/]Heroic[\\/]|\.app[\\/]Contents[\\/]Resources[\\/]game[\\/]/i.test(String(p));
