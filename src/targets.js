// What we're building the game folder for. The host app can target any of them;
// the AI is told which one so it picks the right release asset.

// Consoles a homebrew port can run on. platform: the name on catalog cards and filters.
// ext: a file type only that console runs, which settles it. name: the console named in a file name, which doesn't -
// PC recomps of Xbox 360 or PSP games name the original console all the time ("Spider-Man.3.Xbox.360.Recomp.zip"),
// so a named console is only a hint the sorter confirms from the README.
export const CONSOLES = {
  "xbox360":    { label: "Xbox 360",        platform: "Xbox 360",    how: "a modded RGH/JTAG Xbox 360 running homebrew from a USB stick or its hard drive", ext: /\.xex$/i, name: /xbox[-_. ]?360|(^|[^a-z0-9])x360([^a-z0-9]|$)|xenon/i },
  "xbox":       { label: "Original Xbox",   platform: "Xbox",        how: "a softmodded or modchipped original Xbox", ext: /\.xbe$/i, name: /(^|[^a-z])og[-_ ]?xbox|xbox[-_ ]?(og|classic)/i },
  "xboxseries": { label: "Xbox Series X|S", platform: "Xbox Series", how: "an Xbox One or Series X|S in Developer Mode", ext: /\.never$/, name: /xbox[-_ ]?(series|sx|one)|xboxsx|(^|[^a-z])xbsx([^a-z]|$)/i },
  "switch":     { label: "Nintendo Switch", platform: "Switch",      how: "a Switch running custom firmware, files copied to its SD card", ext: /\.(nro|nsp|xci)$/i, name: /switch/i },
  "wiiu":       { label: "Wii U",           platform: "Wii U",       how: "a Wii U running Aroma or Tiramisu, files copied to its SD card", ext: /\.(wuhb|rpx|wua)$/i, name: /wii[-_ ]?u/i },
  "wii":        { label: "Wii",             platform: "Wii",         how: "a Wii with the Homebrew Channel, files copied to its SD card", ext: /\.(dol|wad)$/i, name: /(^|[^a-z])wii(?![-_ ]?u)([^a-z]|$)/i },
  "gamecube":   { label: "GameCube",        platform: "GameCube",    how: "a GameCube running Swiss or another homebrew loader", ext: /\.gci$/i, name: /gamecube|(^|[^a-z])ngc([^a-z]|$)/i },
  "3ds":        { label: "Nintendo 3DS",    platform: "3DS",         how: "a 3DS running custom firmware, files copied to its SD card", ext: /\.(3dsx|cia)$/i, name: /3ds/i },
  "nds":        { label: "Nintendo DS",     platform: "DS",          how: "a DS flash cart or a DSi/3DS running homebrew", ext: /\.nds$/i, name: /(^|[^a-z])nds([^a-z]|$)/i },
  "vita":       { label: "PS Vita",         platform: "PS Vita",     how: "a PS Vita running HENkaku, installed with VitaShell", ext: /\.vpk$/i, name: /vita/i },
  "psp":        { label: "PSP",             platform: "PSP",         how: "a PSP running custom firmware, copied to its memory stick", ext: /\.pbp$/i, name: /(^|[^a-z])psp([^a-z]|$)/i },
  "ps2":        { label: "PlayStation 2",   platform: "PS2",         how: "a PS2 running FreeMcBoot or another homebrew loader", ext: /\.never$/, name: /(^|[^a-z0-9])ps2([^a-z0-9]|$)/i },
  "ps3":        { label: "PlayStation 3",   platform: "PS3",         how: "a PS3 running custom firmware or HEN, installed as a .pkg", ext: /\.never$/, name: /(^|[^a-z0-9])ps3([^a-z0-9]|$)/i },
  "ps4":        { label: "PlayStation 4",   platform: "PS4",         how: "a jailbroken PS4, installed as a .pkg", ext: /\.never$/, name: /(^|[^a-z0-9])ps4([^a-z0-9]|$)/i },
  "dreamcast":  { label: "Dreamcast",       platform: "Dreamcast",   how: "a Dreamcast, burned to a disc or loaded from an SD card or GDEMU", ext: /\.cdi$/i, name: /dreamcast/i },
};
const an = (w) => `${/^[AEIOUX]/.test(w) ? "an" : "a"} ${w}`;
// The console a file type proves, or null.
export const consoleOfAsset = (name) => Object.entries(CONSOLES).find(([, c]) => c.ext.test(String(name)))?.[0] || null;
// A console a file name mentions (a hint only, see above), or null.
export const consoleNamedIn = (name) => Object.entries(CONSOLES).find(([, c]) => c.name.test(String(name)))?.[0] || null;
export const CONSOLE_PLATFORMS = Object.values(CONSOLES).map((c) => c.platform);

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
  // Consoles: homebrew ports. Decomp Buddy downloads and unpacks the scanned file into Console Games with the project's
  // own steps for getting it onto the console (USB stick, SD card, FTP); it can't install onto a console itself.
  ...Object.fromEntries(Object.entries(CONSOLES).map(([id, c]) => [id, { label: c.label, prompt: `${c.label} homebrew (${c.how})`, assetKey: id, buildDoc: `HOW TO PUT IT ON YOUR ${c.label.toUpperCase()}.txt`, where: `your ${c.label}`, os: id, arch: "", kind: "console", platform: c.platform }])),
};

// Which computer a target's builds are listed under on catalog cards (Windows / macOS / Linux).
export const PLATFORM_OF_TARGET = Object.fromEntries(Object.entries(TARGETS).map(([id, t]) => [id, t.platform || { windows: "Windows", macos: "macOS", linux: "Linux", android: "Android", quest: "Meta Quest" }[t.os]]));
// An ARM target without its own published plan uses the x64 one: Windows on ARM runs x64 programs, and on
// ARM Linux setup swaps in the release's aarch64 file when there is one (armSibling).
export const PLAN_FALLBACK = { "macos-x64": "macos-arm64", "windows-arm64": "windows", "linux-arm64": "linux" };

export const targetOf = (id) => TARGETS[id] || TARGETS.windows;
export const isDeviceTarget = (id) => TARGETS[id]?.kind === "device";
export const isConsoleTarget = (id) => TARGETS[id]?.kind === "console";
export const hostTarget = (platform = process.platform, arch = process.arch) => platform === "win32" ? (arch === "arm64" ? "windows-arm64" : "windows")
  : platform === "linux" ? (arch === "arm64" ? "linux-arm64" : "linux") : arch === "arm64" ? "macos-arm64" : "macos-x64";

// Does a target run on the machine the app is on? Intel Mac builds run on Apple Silicon (Rosetta) and x64 Windows
// builds on Windows on ARM (Prism); x64 Linux builds don't run on ARM Linux.
export function targetIsHost(id, platform = process.platform, arch = process.arch) {
  const t = TARGETS[id]; if (!t || t.kind !== "desktop") return false;
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
  // A console takes a file for that console; one naming another console (or plainly a computer/phone build) is refused.
  if (isConsoleTarget(id)) { const c = consoleOfAsset(n) || (consoleNamedIn(n) !== id && consoleNamedIn(n)); return c && c !== id ? `${an(CONSOLES[c].label)} build` : !c && /\.apk$|\.exe$|\.msi$|\.dmg$|\.appimage$|\.deb$/.test(n) ? "a computer or phone build" : null; }
  if (/\.apk$/.test(n)) return "an Android app";
  if (consoleOfAsset(n)) return `${an(CONSOLES[consoleOfAsset(n)].label)} build`;
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
