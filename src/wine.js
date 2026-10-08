// Windows games on a Mac, experimentally, through Wine. Whisky (the old one-click Wine app) is
// discontinued, and Apple's Game Porting Toolkit can't be redistributed, so this uses Gcenx's macOS
// Wine builds (the ones Homebrew's wine casks install): downloaded from GitHub into Decomp Buddy's
// own tools folder, checked against GitHub's published SHA-256, one Wine prefix per game.
// Honest limits: the builds are Intel code (Rosetta 2 runs them), and games that need Vulkan or
// DirectX 12 - most Xbox 360 recomps - won't run this way. DirectX 9/11 and OpenGL ports often do.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
export const WINE_REPO = "Gcenx/macOS_Wine_builds";

export async function latestWine({ fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`https://api.github.com/repos/${WINE_REPO}/releases/latest`, { headers: { "User-Agent": "decomp-buddy", Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(res.status === 403 ? "GitHub's hourly limit ran out - try again later, or add a GitHub token in Settings." : `GitHub answered ${res.status}`);
  const r = await res.json();
  const a = (r.assets || []).find((x) => /^wine-staging-.*-osx64\.tar\.xz$/.test(x.name)) || (r.assets || []).find((x) => /-osx64\.tar\.xz$/.test(x.name));
  if (!a) throw new Error("The Wine release has no macOS download.");
  return { tag: r.tag_name, name: a.name, url: a.browser_download_url, size: a.size, digest: a.digest || null };
}

// Rosetta 2 runs the Intel Wine build on Apple Silicon; Intel Macs don't need it.
export function rosettaReady({ arch = process.arch } = {}) {
  if (arch !== "arm64") return true;
  try { execFileSync("/usr/bin/arch", ["-x86_64", "/usr/bin/true"], { stdio: "ignore", timeout: 10_000 }); return true; } catch { return false; }
}

// The wine launcher inside an unpacked build ("Wine Staging.app/Contents/Resources/wine/bin/wine").
export function findWineBinary(dir) {
  const stack = [[dir, 0]];
  while (stack.length) {
    const [d, depth] = stack.pop(); if (depth > 6) continue;
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isFile() && (e.name === "wine" || e.name === "wine64") && path.basename(d) === "bin") return p;
      if (e.isDirectory()) stack.push([p, depth + 1]);
    }
  }
  return null;
}

const META = "decomp-buddy-wine.json";
export function wineStatus(toolsDir) {
  try { const m = JSON.parse(fs.readFileSync(path.join(toolsDir, META), "utf8")); if (fs.existsSync(m.bin)) return { installed: true, ...m }; } catch {}
  return { installed: false };
}

export async function installWine(toolsDir, { download, log = () => {}, ctrl = null, release = null }) {
  const rel = release || await latestWine();
  fs.mkdirSync(toolsDir, { recursive: true });
  const tarball = path.join(toolsDir, rel.name);
  log(`Downloading Wine ${rel.tag} (${Math.round(rel.size / 1e6)} MB) from github.com/${WINE_REPO}…`);
  await download(rel.url, tarball, log, { digest: rel.digest, ctrl });
  const dest = path.join(toolsDir, rel.tag);
  fs.rmSync(dest, { recursive: true, force: true }); fs.mkdirSync(dest, { recursive: true });
  log("Unpacking Wine…");
  try { await run("/usr/bin/tar", ["-xJf", tarball, "-C", dest], { maxBuffer: 64 * 1024 * 1024 }); }
  finally { fs.rmSync(tarball, { force: true }); }
  // Downloaded by us, checked against GitHub's checksum: clear the quarantine flag so macOS runs it.
  try { await run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", dest]); } catch {}
  const bin = findWineBinary(dest);
  if (!bin) throw new Error("Unpacked Wine, but couldn't find its launcher inside.");
  for (const old of fs.readdirSync(toolsDir)) if (old !== rel.tag && old !== META && fs.statSync(path.join(toolsDir, old)).isDirectory()) fs.rmSync(path.join(toolsDir, old), { recursive: true, force: true });
  const meta = { tag: rel.tag, bin, installedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(toolsDir, META), JSON.stringify(meta, null, 2));
  log(`Wine ${rel.tag} is ready.`);
  return meta;
}

// One prefix per game folder, so one game's Windows settings can't break another's.
// (Wine creates the prefix itself on first run, but only if the folder it goes in exists.)
export function prefixFor(prefixesDir, gameFolder) { fs.mkdirSync(prefixesDir, { recursive: true }); return path.join(prefixesDir, crypto.createHash("sha1").update(path.resolve(gameFolder)).digest("hex").slice(0, 12)); }

export function wineLaunchSpec(bin, exe, { args = [], prefix, env = process.env, headless = false } = {}) {
  return {
    cmd: bin, argv: [exe, ...args],
    opts: { cwd: path.dirname(exe), env: { ...env, WINEPREFIX: prefix, WINEDEBUG: "-all", ...(headless ? { WINEDLLOVERRIDES: "winemac.drv=d" } : {}) } },
  };
}
