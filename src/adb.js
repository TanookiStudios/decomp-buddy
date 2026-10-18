// Phones, handhelds and Meta Quest headsets over USB, through Google's adb (Android Platform-Tools).
// Everything here takes a `run(args)` made by adbRunner(), so tests swap in a fake adb (test/fixtures/fake-adb.mjs).
// Google's tools are downloaded only after the player agrees to Google's terms (src/main/devices.js),
// from the same repository index Android Studio reads, and checked against the SHA-1 it publishes.

import fs from "node:fs";
import path from "node:path";
import { execFile as execFileCb, execFileSync } from "node:child_process";

export const REPO_XML = "https://dl.google.com/android/repository/repository2-3.xml";
export const SDK_TERMS = "https://developer.android.com/studio/terms";
const EXE = (platform) => (platform === "win32" ? "adb.exe" : "adb");

// DECOMP_ADB (tests and smokes), else adb already on PATH, else the copy Decomp Buddy downloaded.
export function findAdb({ env = process.env, toolsDir, platform = process.platform, exists = fs.existsSync } = {}) {
  if (env.DECOMP_ADB) return env.DECOMP_ADB;
  for (const d of String(env.PATH || "").split(path.delimiter).filter(Boolean)) if (exists(path.join(d, EXE(platform)))) return path.join(d, EXE(platform));
  const own = toolsDir && path.join(toolsDir, "platform-tools", EXE(platform));
  return own && exists(own) ? own : null;
}

// run(args, { timeout }) -> stdout. A .mjs/.js "adb" (the test fake) runs under this Node/Electron binary.
export function adbRunner(bin, { execFile = execFileCb } = {}) {
  return (args, { timeout = 60_000 } = {}) => new Promise((resolve, reject) => {
    const script = /\.m?js$/i.test(bin);
    const [cmd, argv] = script ? [process.execPath, [bin, ...args]] : [bin, args];
    execFile(cmd, argv, { timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true, env: script ? { ...process.env, ELECTRON_RUN_AS_NODE: "1" } : process.env }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || "").trim().split("\n").pop() || err.message));
      resolve(String(stdout));
    });
  });
}

// `adb devices -l` -> [{ serial, state, model, product }]. state: device | unauthorized | offline | no permissions | ...
export function parseDevices(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^(\S+)\s+(device|unauthorized|offline|no permissions|authorizing|connecting|recovery|sideload|bootloader)\b(.*)$/);
    if (!m) continue;
    const field = (k) => (m[3].match(new RegExp(`\\b${k}:(\\S+)`)) || [])[1] || null;
    out.push({ serial: m[1], state: m[2], model: field("model")?.replace(/_/g, " ") || null, product: field("product") });
  }
  return out;
}
export const listDevices = async (run) => parseDevices(await run(["devices", "-l"], { timeout: 15_000 }));

// Three getprop lines (manufacturer, model, ABI list) -> { kind: "quest" | "android", manufacturer, model, abis }.
export function classifyProps(text) {
  const [manufacturer = "", model = "", abilist = ""] = String(text).split(/\r?\n/).map((s) => s.trim());
  const kind = /^(oculus|meta)\b/i.test(manufacturer) || /^quest/i.test(model) ? "quest" : "android";
  return { kind, manufacturer, model, abis: abilist.split(",").filter(Boolean) };
}
export const classify = async (run, serial) => classifyProps(await run(["-s", serial, "shell", "getprop ro.product.manufacturer; getprop ro.product.model; getprop ro.product.cpu.abilist"], { timeout: 15_000 }));

// A plan's push_to + a file name -> "/sdcard/<push_to>/<name>". A leading /sdcard/ is accepted; any other
// absolute path, "..", or a backslash is refused, so a plan can never write outside shared storage.
export function safeRemote(pushTo, name) {
  const rel = String(pushTo ?? "").trim().replace(/^\/?(sdcard|storage\/emulated\/0)(\/|$)/, "");
  const parts = [...rel.split("/"), String(name ?? "")].filter((p) => p && p !== ".");
  if (/\\/.test(`${pushTo}${name}`) || /^\//.test(rel) || /^[a-z]:/i.test(rel) || parts.includes("..") || !parts.length || /[\x00-\x1f]/.test(parts.join(""))) throw new Error(`Refusing to copy to "${pushTo}/${name}" - that isn't a folder on the device's storage.`);
  return `/sdcard/${parts.join("/")}`;
}

// Package names go to the device's shell (monkey, pm): letters, digits, underscores and dots only.
const PKG = /^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/;
const pkgOk = (pkg) => { if (!PKG.test(String(pkg))) throw new Error(`"${pkg}" isn't an Android package name.`); return pkg; };

// adb prints "Failure [...]" with exit code 0 on some versions.
const failed = (out) => { const m = String(out).match(/Failure \[[^\]]*\]|^Error:.*$/m); if (m) throw new Error(m[0]); return out; };
export const installApk = async (run, serial, apk) => failed(await run(["-s", serial, "install", "-r", "--streaming", apk], { timeout: 15 * 60_000 }));
export const listPackages = async (run, serial) => (await run(["-s", serial, "shell", "pm list packages -3"], { timeout: 30_000 })).split(/\r?\n/).map((l) => l.replace(/^package:/, "").trim()).filter((p) => PKG.test(p));
export const launch = async (run, serial, pkg) => failed(await run(["-s", serial, "shell", "monkey", "-p", pkgOk(pkg), "-c", "android.intent.category.LAUNCHER", "1"], { timeout: 30_000 }));
// keepData: "uninstall -k" leaves the game's saves and settings on the device.
export const uninstall = async (run, serial, pkg, { keepData = true } = {}) => failed(await run(["-s", serial, "uninstall", ...(keepData ? ["-k"] : []), pkgOk(pkg)], { timeout: 120_000 }));
export const pull = (run, serial, remote, local) => run(["-s", serial, "pull", remote, local], { timeout: 30 * 60_000 });

// files: [{ from, to }] (to from safeRemote). One at a time, so progress reads "file 2 of 5".
export async function pushFiles(run, serial, files, { log = () => {} } = {}) {
  for (const [i, f] of files.entries()) {
    log(`Copying ${path.basename(f.from)} to ${f.to} (file ${i + 1} of ${files.length})…`);
    await run(["-s", serial, "push", f.from, f.to], { timeout: 60 * 60_000 });
  }
  return files.length;
}

const newer = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
// The repository index -> the newest stable platform-tools archive for this OS: { version, url, sha1, size }.
export function parsePlatformTools(xml, platform = process.platform) {
  const os = { darwin: "macosx", win32: "windows", linux: "linux" }[platform];
  let best = null;
  for (const [, body] of String(xml).matchAll(/<remotePackage path="platform-tools">([\s\S]*?)<\/remotePackage>/g)) {
    const ch = (body.match(/<channelRef ref="([^"]+)"/) || [])[1];
    if (ch && ch !== "channel-0") continue; // stable only
    const rev = ["major", "minor", "micro"].map((k) => Number((body.match(new RegExp(`<${k}>(\\d+)</${k}>`)) || [])[1] || 0));
    for (const [, a] of body.matchAll(/<archive>([\s\S]*?)<\/archive>/g)) {
      if ((a.match(/<host-os>([^<]+)<\/host-os>/) || [])[1] !== os) continue;
      const sha1 = (a.match(/<checksum type="sha1">([0-9a-f]{40})<\/checksum>/i) || [])[1], file = (a.match(/<url>([^<]+)<\/url>/) || [])[1];
      if (!sha1 || !file) continue;
      const cand = { version: rev.join("."), rev, url: new URL(file, REPO_XML).href, sha1: sha1.toLowerCase(), size: Number((a.match(/<size>(\d+)<\/size>/) || [])[1]) || 0 };
      if (!best || newer(cand.rev, best.rev)) best = cand;
    }
  }
  if (!best) throw new Error("Google's download list has no Platform-Tools for this computer.");
  delete best.rev; return best;
}

// Download Platform-Tools into toolsDir/platform-tools. download() is setup.js's (resumes, checks the SHA-1).
export async function installPlatformTools(toolsDir, { download, extract, fetchImpl = fetch, platform = process.platform, log = () => {}, ctrl = null }) {
  const res = await fetchImpl(REPO_XML, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Google's download list answered ${res.status}.`);
  const pt = parsePlatformTools(await res.text(), platform);
  fs.mkdirSync(toolsDir, { recursive: true });
  const zip = path.join(toolsDir, path.basename(new URL(pt.url).pathname));
  log(`Downloading Android Platform-Tools ${pt.version} (${Math.round(pt.size / 1e6)} MB) from dl.google.com…`);
  await download(pt.url, zip, log, { digest: `sha1:${pt.sha1}`, ctrl });
  const dest = path.join(toolsDir, "platform-tools");
  fs.rmSync(dest, { recursive: true, force: true });
  try { extract(zip, dest); } finally { fs.rmSync(zip, { force: true }); }
  const bin = path.join(dest, EXE(platform));
  if (!fs.existsSync(bin)) throw new Error("Unpacked Platform-Tools, but adb wasn't inside.");
  if (platform !== "win32") fs.chmodSync(bin, 0o755);
  if (platform === "darwin") try { execFileSync("/usr/bin/xattr", ["-dr", "com.apple.quarantine", dest]); } catch {}
  log(`Android Platform-Tools ${pt.version} is ready.`);
  return { version: pt.version, bin };
}
