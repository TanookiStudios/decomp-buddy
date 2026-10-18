// What we're building the game folder for. The host app can target any of them;
// the AI is told which one so it picks the right release asset.

export const TARGETS = {
  "windows":       { label: "Windows PC",          prompt: "Windows x64",                     assetKey: "windows",       buildDoc: "BUILD ON PC.txt",    where: "the PC",        os: "windows", arch: "x64",   kind: "desktop" },
  "windows-arm64": { label: "Windows PC (ARM)",    prompt: "Windows on ARM64 (Snapdragon)",   assetKey: "windows-arm64", buildDoc: "BUILD ON PC.txt",    where: "the PC",        os: "windows", arch: "arm64", kind: "desktop" },
  "macos-arm64":   { label: "Mac (Apple Silicon)", prompt: "macOS on Apple Silicon (arm64)",  assetKey: "macos-arm64",   buildDoc: "BUILD ON MAC.txt",   where: "your Mac",      os: "macos",   arch: "arm64", kind: "desktop" },
  "macos-x64":     { label: "Mac (Intel)",         prompt: "macOS on Intel (x86_64)",         assetKey: "macos-x64",     buildDoc: "BUILD ON MAC.txt",   where: "your Mac",      os: "macos",   arch: "x64", kind: "desktop" },
  "linux":         { label: "Linux",               prompt: "Linux x64",                       assetKey: "linux",         buildDoc: "BUILD ON LINUX.txt", where: "your Linux PC", os: "linux",   arch: "x64", kind: "desktop" },
  "linux-arm64":   { label: "Linux (ARM)",         prompt: "Linux on ARM64 (aarch64)",        assetKey: "linux-arm64",   buildDoc: "BUILD ON LINUX.txt", where: "your Linux PC", os: "linux",   arch: "arm64", kind: "desktop" },
  // Devices: the game is an Android app (.apk) staged in the Library, then installed over USB with adb (src/adb.js).
  "android":       { label: "Android Phone Or Handheld", prompt: "an Android phone or handheld (an .apk installed over USB)", assetKey: "android", buildDoc: "BUILD THE APP.txt", where: "your phone", os: "android", arch: "arm64", kind: "device" },
  "quest":         { label: "Meta Quest",          prompt: "a Meta Quest VR headset (an Android .apk sideloaded over USB)", assetKey: "quest", buildDoc: "BUILD THE APP.txt", where: "your headset", os: "quest", arch: "arm64", kind: "device" },
};

// Which computer a target's builds are listed under on catalog cards (Windows / macOS / Linux).
export const PLATFORM_OF_TARGET = Object.fromEntries(Object.entries(TARGETS).map(([id, t]) => [id, { windows: "Windows", macos: "macOS", linux: "Linux", android: "Android", quest: "Meta Quest" }[t.os]]));
// An ARM target without its own published plan uses the x64 one: Windows on ARM runs x64 programs, and on
// ARM Linux setup swaps in the release's aarch64 file when there is one (armSibling).
export const PLAN_FALLBACK = { "macos-x64": "macos-arm64", "windows-arm64": "windows", "linux-arm64": "linux" };

export const targetOf = (id) => TARGETS[id] || TARGETS.windows;
export const isDeviceTarget = (id) => TARGETS[id]?.kind === "device";
export const hostTarget = (platform = process.platform, arch = process.arch) => platform === "win32" ? (arch === "arm64" ? "windows-arm64" : "windows")
  : platform === "linux" ? (arch === "arm64" ? "linux-arm64" : "linux") : arch === "arm64" ? "macos-arm64" : "macos-x64";

// Does a target run on the machine the app is on? Intel Mac builds run on Apple Silicon (Rosetta) and x64 Windows
// builds on Windows on ARM (Prism); x64 Linux builds don't run on ARM Linux.
export function targetIsHost(id, platform = process.platform, arch = process.arch) {
  const t = TARGETS[id]; if (!t || t.kind === "device") return false;
  const hostOs = { win32: "windows", darwin: "macos", linux: "linux" }[platform];
  if (t.os !== hostOs) return false;
  return hostOs !== "linux" || t.arch === (arch === "arm64" ? "arm64" : "x64");
}

import os from "node:os";
import path from "node:path";
export const defaultInstallDir = () => path.join(os.homedir(), "Games", "Decomp Buddy");
export const defaultTransferDir = () => path.join(os.homedir(), "Downloads", process.platform === "win32" ? "Transfer to Mac or Linux" : "Transfer to PC");

// Does an asset filename obviously belong to another platform than the target? (Hard guard behind the AI.)
// Devices take an .apk only. A Quest takes any .apk (plain Android apps run in a window there); when a release has
// several, the planner is told to prefer the one naming quest/oculus/vr (src/plan.js). A phone refuses VR builds.
const VR_BUILD = /quest|oculus|openxr|(^|[^a-z])(vr|xr)([^a-z]|$)/;
export function assetMismatch(name, id) {
  const n = String(name).toLowerCase();
  if (isDeviceTarget(id)) return !/\.apk$/.test(n) ? "a computer build (a device needs an .apk)" : id === "android" && VR_BUILD.test(n) ? "a VR headset build" : null;
  if (/\.apk$/.test(n)) return "an Android app";
  const isWin = /win(dows|64|32)?[-_.]|\.exe$|\.msi$/.test(n) || /-win\b/.test(n);
  const isMac = /mac(os)?|darwin|\.dmg$|\.pkg$/.test(n);
  const isLinux = /linux|\.appimage$|\.deb$|\.rpm$|\.tar\.zst$/.test(n);
  if (id === "windows" && (isMac || isLinux) && !isWin) return "a Mac/Linux build";
  if (id.startsWith("macos") && (isWin || isLinux) && !isMac) return "a Windows/Linux build";
  if (id === "linux" && (isWin || isMac) && !isLinux) return "a Windows/Mac build";
  if (id === "macos-arm64" && isMac && /x64|x86_64|intel/.test(n) && !/arm64|aarch64|universal/.test(n)) return "an Intel Mac build";
  if (id === "macos-x64" && isMac && /arm64|aarch64|apple[-_]?silicon/.test(n) && !/x64|x86_64|universal/.test(n)) return "an Apple Silicon build";
  if (id === "linux-arm64" && isLinux && /x86[-_]64|amd64|\bx64\b|i[36]86/.test(n) && !/arm64|aarch64/.test(n)) return "an x64 Linux build";
  if ((id === "linux" || id === "windows") && /arm64|aarch64/.test(n) && !/x64|x86[-_]64|amd64|universal/.test(n)) return "an ARM build";
  return null;
}

// On ARM Linux: the aarch64 file released beside a planned x86_64 one (same name, other CPU), if there is one.
export function armSibling(assets, name) {
  const want = [/x86[-_]64/i, /amd64/i, /\bx64\b/i].flatMap((re) => re.test(name) ? ["aarch64", "arm64"].map((a) => name.replace(re, a).toLowerCase()) : []);
  return (assets || []).find((a) => want.includes(a.name.toLowerCase())) || null;
}

// A Steam Deck in Gaming Mode (Steam runs apps inside gamescope there).
export const inGamingMode = (env = process.env) => env.SteamDeck === "1" && (env.XDG_CURRENT_DESKTOP === "gamescope" || !!env.GAMESCOPE_WAYLAND_DISPLAY || env.SteamGamepadUI === "1");
