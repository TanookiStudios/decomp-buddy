// Save sync between computers through a folder the player already syncs (iCloud Drive, OneDrive,
// Dropbox, Google Drive). Decomp Buddy never runs a server for this: it copies its save backups into
// <sync folder>/Decomp Buddy Saves/<game>/ and offers the newest one from another computer back.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SYNC_DIR = "Decomp Buddy Saves";
export const KEEP_CLOUD = 10;

// Folders that look like a cloud drive on this computer, most likely first.
export function cloudCandidates({ home = os.homedir(), env = process.env, platform = process.platform } = {}) {
  const out = [];
  const add = (label, p) => { if (p && fs.existsSync(p) && !out.some((o) => o.path === p)) out.push({ label, path: p }); };
  const cs = path.join(home, "Library", "CloudStorage");
  const inCs = (re) => { try { return fs.readdirSync(cs).filter((n) => re.test(n)).map((n) => path.join(cs, n)); } catch { return []; } };
  if (platform === "darwin") add("iCloud Drive", path.join(home, "Library", "Mobile Documents", "com~apple~CloudDocs"));
  if (platform === "win32") { add("OneDrive", env.OneDrive || env.OneDriveConsumer); add("iCloud Drive", path.join(home, "iCloudDrive")); }
  for (const p of inCs(/^OneDrive/)) add("OneDrive", p);
  add("OneDrive", path.join(home, "OneDrive"));
  for (const p of inCs(/^Dropbox/)) add("Dropbox", p);
  add("Dropbox", path.join(home, "Dropbox"));
  for (const p of inCs(/^GoogleDrive/)) add("Google Drive", fs.existsSync(path.join(p, "My Drive")) ? path.join(p, "My Drive") : p);
  return out;
}

// One folder per game: repo, plus the game's title for one-repo-many-games collections.
export const gameKey = (repo, title) => String(repo || "").toLowerCase().replace(/[^a-z0-9._-]+/g, "_") + (title ? `__${String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "");
export const cloudDir = (syncRoot, key) => path.join(syncRoot, SYNC_DIR, key);

// Zip names: "2026-09-29T08-15-00 Mac-3f2a.zip" - time first so a name sort is a time sort.
export function listCloud(syncRoot, key) {
  const d = cloudDir(syncRoot, key);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((n) => /\.zip$/i.test(n)).sort().reverse().map((n) => {
    const m = n.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\s+(.+)\.zip$/i);
    return { file: path.join(d, n), name: n, at: m ? m[1].replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3Z") : null, machine: m ? m[2] : "unknown" };
  });
}

// Copy one local backup zip up; the cloud folder keeps the newest KEEP_CLOUD.
export function pushToCloud(zip, syncRoot, key, { machine, now = new Date() } = {}) {
  const d = cloudDir(syncRoot, key); fs.mkdirSync(d, { recursive: true });
  const dest = path.join(d, `${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)} ${machine}.zip`);
  fs.copyFileSync(zip, dest);
  for (const old of listCloud(syncRoot, key).slice(KEEP_CLOUD)) fs.rmSync(old.file, { force: true });
  return dest;
}

// The newest cloud save made on another computer, if it's newer than anything we pushed or pulled.
export function newerFromElsewhere(syncRoot, key, { machine, since = null } = {}) {
  const other = listCloud(syncRoot, key).find((c) => c.machine !== machine);
  if (!other || !other.at) return null;
  return !since || other.at > since ? other : null;
}

// A backup made on another computer records that computer's save folders. Map them onto this
// computer's documented folders: same count -> by position; one folder -> the first here.
export function mapSavePaths(recorded, here) {
  if (!here.length) throw new Error("This game's saves location isn't known on this computer, so a save from elsewhere can't be put back.");
  if (recorded.length === here.length) return recorded.map((_, i) => here[i]);
  if (recorded.length === 1) return [here[0]];
  throw new Error("The save folders on the two computers don't line up - restore this one by hand from the sync folder.");
}
