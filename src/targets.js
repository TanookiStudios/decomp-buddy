// What we're building the game folder for. The host app can target any of them;
// the AI is told which one so it picks the right release asset.

export const TARGETS = {
  "windows":     { label: "Windows PC",          prompt: "Windows x64",                     assetKey: "windows",     buildDoc: "BUILD ON PC.txt",       where: "the PC" },
  "macos-arm64": { label: "Mac (Apple Silicon)", prompt: "macOS on Apple Silicon (arm64)",  assetKey: "macos-arm64", buildDoc: "BUILD ON MAC.txt",      where: "your Mac" },
  "macos-x64":   { label: "Mac (Intel)",         prompt: "macOS on Intel (x86_64)",         assetKey: "macos-x64",   buildDoc: "BUILD ON MAC.txt",      where: "your Mac" },
  "linux":       { label: "Linux",               prompt: "Linux x64",                       assetKey: "linux",       buildDoc: "BUILD ON LINUX.txt",    where: "your Linux PC" },
};

export const targetOf = (id) => TARGETS[id] || TARGETS.windows;
export const hostTarget = () => process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : process.arch === "arm64" ? "macos-arm64" : "macos-x64";

// Does a target run on the machine the app is on? (Intel Mac builds run on Apple Silicon via Rosetta.)
export const targetIsHost = (id) => process.platform === "win32" ? id === "windows" : process.platform === "linux" ? id === "linux" : id.startsWith("macos");

import os from "node:os";
import path from "node:path";
export const defaultInstallDir = () => path.join(os.homedir(), "Games", "Decomp Buddy");
export const defaultTransferDir = () => path.join(os.homedir(), "Downloads", process.platform === "win32" ? "Transfer to Mac or Linux" : "Transfer to PC");

// Does an asset filename obviously belong to another platform than the target? (Hard guard behind the AI.)
export function assetMismatch(name, id) {
  const n = String(name).toLowerCase();
  const isWin = /win(dows|64|32)?[-_.]|\.exe$|\.msi$/.test(n) || /-win\b/.test(n);
  const isMac = /mac(os)?|darwin|\.dmg$|\.pkg$/.test(n);
  const isLinux = /linux|\.appimage$|\.deb$|\.rpm$|\.tar\.zst$/.test(n);
  if (id === "windows" && (isMac || isLinux) && !isWin) return "a Mac/Linux build";
  if (id.startsWith("macos") && (isWin || isLinux) && !isMac) return "a Windows/Linux build";
  if (id === "linux" && (isWin || isMac) && !isLinux) return "a Windows/Mac build";
  if (id === "macos-arm64" && isMac && /x64|x86_64|intel/.test(n) && !/arm64|aarch64|universal/.test(n)) return "an Intel Mac build";
  if (id === "macos-x64" && isMac && /arm64|aarch64|apple[-_]?silicon/.test(n) && !/x64|x86_64|universal/.test(n)) return "an Apple Silicon build";
  return null;
}

// A Steam Deck in Gaming Mode (Steam runs apps inside gamescope there).
export const inGamingMode = (env = process.env) => env.SteamDeck === "1" && (env.XDG_CURRENT_DESKTOP === "gamescope" || !!env.GAMESCOPE_WAYLAND_DISPLAY || env.SteamGamepadUI === "1");
