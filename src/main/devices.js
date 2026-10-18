// Phones And Headsets: Android phones/handhelds and Meta Quest headsets over USB (adb, src/adb.js).
// A device game is set up like any other (setupGame stages its .apk and game files in the Library folder);
// installing it here runs `adb install` and copies each game file to /sdcard/<push_to>. The renderer
// polls devices:list every 2 s, only while its screen is open.
import { app, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findAdb, adbRunner, listDevices, classify, installApk, listPackages, pushFiles, safeRemote, launch, uninstall, pull, installPlatformTools, SDK_TERMS } from "../adb.js";
import { TARGETS } from "../targets.js";
import { readManifests } from "../installhtml.js";
import { backupSaves } from "../saves.js";
import { readM, stamp, libraryFolder } from "./game.js";
import { logTo, loadSettings, saveSettings, libraryDirs } from "./core.js";
import { kiosk } from "./window.js";

const toolsDir = () => path.join(app.getPath("userData"), "tools");
const runner = () => { const bin = findAdb({ toolsDir: toolsDir() }); return bin ? adbRunner(bin) : null; };
const needRunner = () => runner() || (() => { throw new Error("Download Android Platform-Tools first (Phones And Headsets)."); })();
const isDevice = (m) => TARGETS[m.target]?.kind === "device";
const titleOf = (m) => m.displayName || m.plan?.game_title || m.folder;
const kinds = new Map(); // serial -> classify(): what a device is doesn't change while it's plugged in

const STATE_HELP = {
  unauthorized: "Put on the headset (or unlock the phone) and choose Always Allow From This Computer.",
  offline: "The device is offline - unplug it and plug it back in.",
  "no permissions": "This computer won't let Decomp Buddy talk to the device. On Linux, install Android's udev rules for your system, then plug it in again.",
};

// Plugged-in devices; the ready ones say what they are (quest / android) and their model.
export async function connected(run = runner()) {
  if (!run) return [];
  const devices = await listDevices(run);
  for (const d of devices.filter((x) => x.state === "device")) {
    if (!kinds.has(d.serial)) kinds.set(d.serial, await classify(run, d.serial).catch(() => ({ kind: "android", abis: [] })));
    const k = kinds.get(d.serial); Object.assign(d, k, { model: k.model || d.model });
  }
  return devices;
}
async function readyDevice(run, serial) {
  const d = (await connected(run)).find((x) => x.serial === serial);
  if (!d) throw new Error("That phone or headset isn't plugged in.");
  if (d.state !== "device") throw new Error(STATE_HELP[d.state] || `The device says "${d.state}" - unplug it and plug it back in.`);
  return d;
}

ipcMain.handle("devices:list", async () => {
  const s = loadSettings(), run = runner();
  let devices = [], error = null;
  try { devices = await connected(run); } catch (err) { error = err.message; }
  const games = libraryDirs(s).flatMap((dir) => readManifests(dir).filter(isDevice).map((m) => ({
    folder: path.join(dir, m.folder), title: titleOf(m), target: m.target, status: m.status, statusDetail: m.statusDetail || "",
    serial: m.device?.serial || null, model: m.device?.model || null, packageId: m.package_id || null,
  })));
  return { adb: !!run, licensed: !!s.adbLicenseAt, terms: SDK_TERMS, platform: process.platform, devices: devices.map((d) => ({ ...d, help: STATE_HELP[d.state] || "" })), games, error };
});

// Google's terms: the checkbox on the Phones And Headsets screen. Nothing downloads until it's ticked.
ipcMain.handle("devices:agree", (_e, { agree }) => { const s = loadSettings(); if (agree) s.adbLicenseAt = new Date().toISOString(); else delete s.adbLicenseAt; saveSettings(s); return !!agree; });
let toolsCtrl = null;
ipcMain.handle("devices:installTools", async (e) => {
  if (kiosk.locked) throw new Error("That is switched off in Kiosk Mode.");
  if (!loadSettings().adbLicenseAt) throw new Error("Tick the box to agree to Google's Android SDK terms first.");
  if (toolsCtrl) throw new Error("Platform-Tools is already downloading.");
  const { DownloadCtrl, download, extractZip } = await import("../setup.js");
  toolsCtrl = new DownloadCtrl();
  try { return await installPlatformTools(toolsDir(), { download, extract: extractZip, ctrl: toolsCtrl, log: (m) => logTo(e.sender, m) }); }
  finally { toolsCtrl = null; }
});

// Reinstalling on the same device: copy each folder we push into back first, into the game's Saves Backup
// (a zip per update, like computer games). Restoring one is by hand: unzip it and copy the folder back.
async function backupDeviceFolders(run, serial, folder, remotes, log) {
  const dirs = [...new Set(remotes.map((r) => path.posix.dirname(r)))];
  if (!dirs.length) return null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "db-device-"));
  try {
    const got = [];
    for (const [i, d] of dirs.entries()) {
      const local = path.join(tmp, String(i)); fs.mkdirSync(local);
      try { await pull(run, serial, d, local); got.push({ path: path.join(local, path.posix.basename(d)), documented: d }); }
      catch (err) { log(`  couldn't copy ${d} back from the device: ${err.message}`); }
    }
    return await backupSaves(folder, got, { reason: "before-device-update", log });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export async function installOnDevice(folderIn, serial, log = () => {}) {
  if (kiosk.locked) throw new Error("That is switched off in Kiosk Mode.");
  const folder = libraryFolder(folderIn), m = readM(folder), run = needRunner();
  if (!isDevice(m)) throw new Error("That game was set up for a computer, not a phone or headset.");
  const apk = m.apk && path.join(folder, path.basename(m.apk));
  if (!apk || !fs.existsSync(apk)) throw new Error(`${titleOf(m)}'s app file isn't in its folder - set it up again.`);
  const d = await readyDevice(run, serial), model = d.model || serial;
  const files = (m.plan.game_files || []).filter((f) => f.placed);
  for (const f of files.filter((x) => !x.push_to)) log(`${f.label} stays in ${path.join(folder, f.drop_into || "Game Files")} - the project's docs don't say where it goes on the device.`);
  for (const f of (m.plan.game_files || []).filter((x) => !x.placed && x.push_to)) log(`! ${f.label} isn't in place yet - add it to the game, then Reinstall.`);
  const pushes = files.filter((f) => f.push_to).flatMap((f) => [f.placed.name, ...(f.placed.companions || [])].map((name) => ({ from: path.join(folder, f.drop_into || "Game Files", name), to: safeRemote(f.push_to, name) })));
  if (m.device?.serial === serial) await backupDeviceFolders(run, serial, folder, pushes.map((p) => p.to), log);
  const before = await listPackages(run, serial).catch(() => []);
  log(`--- Installing ${titleOf(m)} on ${model}…`);
  await installApk(run, serial, apk);
  // The plan rarely knows the package name; the one that just appeared on the device is it.
  const added = (await listPackages(run, serial).catch(() => [])).filter((p) => !before.includes(p));
  await pushFiles(run, serial, pushes, { log });
  stamp(folder, { status: "on_device", statusDetail: `Installed on ${model}.`, device: { serial, model }, package_id: m.package_id || added[0] || null, installedAt: new Date().toISOString() });
  log(`${titleOf(m)} is on ${model}${pushes.length ? ` with ${pushes.length} file(s)` : ""}.`);
  return { ok: true, pushed: pushes.length, packageId: m.package_id || added[0] || null };
}
ipcMain.handle("devices:install", (e, { folder, serial }) => installOnDevice(folder, serial, (m) => logTo(e.sender, m)));

// Play for a device game (Library, Couch Mode, shortcuts): start the app on the headset or phone. After an update
// that is staged but not reinstalled yet, this starts the copy already on the device.
export async function launchOnDevice(folderIn) {
  const folder = libraryFolder(folderIn), m = readM(folder), run = needRunner();
  if (!m.device?.serial) throw new Error(`${titleOf(m)} isn't on a phone or headset yet - install it from Phones And Headsets.`);
  if (!m.package_id) throw new Error(`Decomp Buddy doesn't know ${titleOf(m)}'s app name - start it on the device (on a Quest: App Library → Unknown Sources).`);
  const d = await readyDevice(run, m.device.serial);
  await launch(run, d.serial, m.package_id);
  stamp(folder, { lastPlayed: new Date().toISOString() });
  return { exe: `${titleOf(m)} on ${d.model || d.serial}` };
}
ipcMain.handle("devices:launch", (_e, { folder }) => launchOnDevice(folder));

// Remove from the device: uninstall -k keeps its saves and settings there; the copy in the Library stays.
ipcMain.handle("devices:remove", async (e, { folder: folderIn }) => {
  if (kiosk.locked) throw new Error("That is switched off in Kiosk Mode.");
  const folder = libraryFolder(folderIn), m = readM(folder), run = needRunner();
  if (!m.device?.serial || !m.package_id) throw new Error(`Decomp Buddy doesn't know which app ${titleOf(m)} is on the device - remove it on the device instead.`);
  const d = await readyDevice(run, m.device.serial);
  await uninstall(run, d.serial, m.package_id, { keepData: true });
  stamp(folder, { status: "staged", statusDetail: "Removed from the device (its saves stayed there). Install it again any time.", device: null });
  logTo(e.sender, `Removed ${titleOf(m)} from ${d.model || d.serial} (saves kept on the device).`);
  return true;
});

// Library: which device serials are plugged in and ready (one quick `adb devices`, only when there are device games).
export async function readySerials() {
  try { return new Set((await connected()).filter((d) => d.state === "device").map((d) => d.serial)); } catch { return new Set(); }
}
