// Executes a plan: downloads the Windows build (or source), lays out the
// game folder, and writes the manifest install.html is built from.

import { hashFile } from "./verify.js";
import { keepVersion, stashPlaced } from "./versions.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import AdmZip from "adm-zip";
import { applyFolderArtwork } from "./icons.js";
import { targetOf, assetMismatch } from "./targets.js";
import { upgradeManifest } from "./installhtml.js";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Manifest fields owned by the player (or stamped after set-up): an update copies them over.
export const USER_FIELDS = ["lastPlayed", "steamAppId", "launchArgs", "modOrder", "modSources", "adopted", "saveSync"];
export const MANIFEST = "decomp-buddy.json";

export function safeName(s) {
  return String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "") || "Untitled";
}

export function gameFolderName(plan) {
  if (plan.folder_name) return safeName(plan.folder_name); // chosen in Review
  return `${safeName(plan.game_title)} - ${safeName(plan.console)}`;
}

// Pause / resume / cancel for every download in a set-up run. Pausing aborts the request in flight;
// resuming continues from the bytes already on disk (HTTP Range), so nothing is fetched twice.
export class DownloadCtrl {
  constructor() { this.paused = false; this.cancelled = false; this.inflight = new Set(); this.waiters = []; }
  pause() { this.paused = true; for (const ac of this.inflight) ac.abort(); }
  resume() { this.paused = false; this.waiters.splice(0).forEach((r) => r()); }
  cancel() { this.cancelled = true; this.resume(); for (const ac of this.inflight) ac.abort(); }
  waitIfPaused() { return this.paused ? new Promise((r) => this.waiters.push(r)) : Promise.resolve(); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Streams to <dest>.part, resuming after a dropped connection (up to `retries` times, backing off),
// then checks the digest ("sha256:…", what GitHub publishes per asset) over the whole file: a mismatch
// deletes it and throws. Returns { verified: true|false|null }.
export async function download(url, dest, log, { digest = null, fetchImpl = fetch, ctrl = null, retries = 4, backoff = 1000 } = {}) {
  const part = `${dest}.part`;
  const [algo, want] = digest && /^(sha256|sha1|md5):([0-9a-f]+)$/i.test(digest) ? digest.split(":") : [null, null];
  let failures = 0, lastPct = -1, total = 0;
  fs.rmSync(part, { force: true });
  for (;;) {
    if (ctrl?.cancelled) { fs.rmSync(part, { force: true }); throw new Error("Cancelled."); }
    await ctrl?.waitIfPaused();
    const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    const ac = new AbortController(); ctrl?.inflight.add(ac);
    try {
      const res = await fetchImpl(url, { headers: { "User-Agent": "decomp-buddy", ...(have ? { Range: `bytes=${have}-` } : {}) }, signal: ac.signal });
      if (!res.ok || !res.body) throw Object.assign(new Error(`Download failed (${res.status}): ${url}`), { fatal: res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 });
      const resumed = have && res.status === 206;
      if (have && !resumed) fs.truncateSync(part, 0); // server ignored the Range: start over
      total = (resumed ? have : 0) + (Number(res.headers.get("content-length")) || 0);
      if (resumed) log(`  resuming at ${Math.round(have / 1_048_576)} MB`);
      let got = resumed ? have : 0;
      const progress = new TransformStream({
        transform(chunk, controller) {
          got += chunk.length;
          const pct = total ? Math.floor((got / total) * 100) : -1;
          if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; log(`  ${pct}% of ${Math.round(total / 1_048_576)} MB`); }
          controller.enqueue(chunk);
        },
      });
      await pipeline(Readable.fromWeb(res.body.pipeThrough(progress)), fs.createWriteStream(part, { flags: resumed ? "a" : "w" }));
      break;
    } catch (err) {
      if (ctrl?.cancelled) { fs.rmSync(part, { force: true }); throw new Error("Cancelled."); }
      if (ctrl?.paused) { log("  paused"); continue; }
      if (err.fatal || ++failures > retries) { fs.rmSync(part, { force: true }); throw err; }
      const wait = backoff * 2 ** (failures - 1);
      log(`  connection dropped (${err.message.slice(0, 80)}) - trying again in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    } finally { ctrl?.inflight.delete(ac); }
  }
  if (!algo) { fs.renameSync(part, dest); if (digest === null) log("  (no checksum published for this file)"); return { verified: null }; }
  const got = await hashFile(part, [algo.toLowerCase()]);
  if (got[algo.toLowerCase()] !== want.toLowerCase()) { fs.rmSync(part, { force: true }); throw new Error(`Download of ${path.basename(dest)} didn't match GitHub's ${algo} checksum - deleted it. Try again.`); }
  fs.renameSync(part, dest);
  log(`  checksum verified (${algo})`);
  return { verified: true };
}

// Free bytes on the volume holding dir (stdlib). null when the platform can't say.
export function freeBytes(dir, statfs = fs.statfsSync) {
  try { const st = statfs(dir); return Number(st.bavail) * Number(st.bsize); } catch { return null; }
}
const fmtGB = (n) => `${(n / 1e9).toFixed(n >= 10e9 ? 0 : 1)} GB`;

// Extract an archive into dir with 7-Zip (keeps Unix permission bits, so Mac/Linux
// builds stay executable). A single top-level folder is hoisted away.
// Every file under dir, relative to it (a .app bundle counts as its files).
export function listFiles(dir) {
  const out = []; const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = path.join(rel, e.name); if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push(r); } };
  walk(dir, ""); return out;
}
// A .dmg: on a Mac, mount it read-only and copy what's inside; elsewhere 7-Zip reads most of them.
function unpackDmg(dmg, tmp, seven) {
  if (process.platform !== "darwin") { execFileSync(seven, ["x", "-y", "-bd", `-o${tmp}`, dmg], { stdio: "ignore" }); return; }
  const mnt = fs.mkdtempSync(path.join(os.tmpdir(), "db-dmg-"));
  execFileSync("hdiutil", ["attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mnt, dmg], { stdio: "ignore" });
  try { for (const n of fs.readdirSync(mnt)) if (!/^\.|^Applications$/.test(n)) execFileSync("cp", ["-R", path.join(mnt, n), tmp]); }
  finally { execFileSync("hdiutil", ["detach", mnt, "-force"], { stdio: "ignore" }); fs.rmSync(mnt, { recursive: true, force: true }); }
}
export function extractZip(archive, dir, { entries: record } = {}) {
  const tmp = `${dir}.extracting-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const seven = require("7zip-bin").path7za.replace("app.asar", "app.asar.unpacked");
  let input = archive;
  if (/\.zst$/i.test(archive)) {
    // 7-Zip has no zstd; Node does. .tar.zst -> .tar, then 7-Zip unpacks the tar.
    const zlib = require("node:zlib");
    input = path.join(tmp, path.basename(archive).replace(/\.zst$/i, ""));
    fs.writeFileSync(input, zlib.zstdDecompressSync(fs.readFileSync(archive)));
  }
  // System tar keeps Unix modes (7-Zip's tar reader doesn't); gz/xz/bz2 tars go straight through it.
  const untar = (file) => execFileSync("tar", ["-xf", file, "-C", tmp], { stdio: "ignore" });
  if (/\.dmg$/i.test(input)) unpackDmg(input, tmp, seven);
  else if (/\.tar$/i.test(input) || /\.(tar\.(gz|xz|bz2)|tgz|txz|tbz2?)$/i.test(input)) untar(input);
  else {
    execFileSync(seven, ["x", "-y", "-bd", `-o${tmp}`, input], { stdio: "ignore", maxBuffer: 16 * 1024 * 1024 });
    for (const inner of fs.readdirSync(tmp).filter((n) => /\.tar$/i.test(n))) { untar(path.join(tmp, inner)); fs.rmSync(path.join(tmp, inner)); }
  }
  if (input !== archive) fs.rmSync(input, { force: true });
  fs.rmSync(path.join(tmp, "__MACOSX"), { recursive: true, force: true });
  let entries = fs.readdirSync(tmp).filter((n) => n !== ".DS_Store");
  let root = tmp;
  // A single top-level folder is a wrapper - unless it's a .app, which is the game itself.
  if (entries.length === 1 && !/\.app$/i.test(entries[0]) && fs.statSync(path.join(tmp, entries[0])).isDirectory()) { root = path.join(tmp, entries[0]); entries = fs.readdirSync(root); }
  if (!entries.length) { fs.rmSync(tmp, { recursive: true, force: true }); throw new Error(`Empty archive: ${path.basename(archive)}`); }
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  // Merge, file by file: a folder the release ships may already hold your game files (a ROM dropped
  // into "assets"), so folders are never replaced wholesale - only the release's own files are.
  const merge = (from, to, rel) => {
    if (fs.lstatSync(from).isDirectory() && fs.existsSync(to) && fs.lstatSync(to).isDirectory()) {
      for (const n of fs.readdirSync(from)) merge(path.join(from, n), path.join(to, n), path.join(rel, n));
      return;
    }
    fs.rmSync(to, { recursive: true, force: true }); fs.renameSync(from, to);
    if (record) { if (fs.lstatSync(to).isDirectory()) for (const f of listFiles(to)) record.push(path.join(rel, f)); else record.push(rel); }
  };
  for (const name of entries) { merge(path.join(root, name), path.join(dir, name), name); count++; }
  fs.rmSync(tmp, { recursive: true, force: true });
  return count;
}

function writePlaceholder(dir, file) {
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    `PUT YOUR GAME FILE HERE`,
    ``,
    `${file.label}`,
    file.description,
    ``,
    `Accepted formats: ${file.accepted_formats.join(", ") || "see project docs"}`,
    file.expected_filename ? `Must be named exactly: ${file.expected_filename}` : `Filename: any`,
    file.how_provided === "in_app_picker" ? `\nThen run the app and pick this file when it asks.` : "",
    file.how_provided === "command_line" ? `\nThis file is passed to a setup tool - see install.html.` : "",
    file.notes ? `\nNotes: ${file.notes}` : "",
    ``,
    `You can delete this text file once your game file is in place.`,
  ];
  fs.writeFileSync(path.join(dir, "PUT GAME FILE HERE.txt"), lines.join("\n"));
}

const fmtBytes = (n) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.round(n / 1e3)} KB`;

function sizeOf(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(p).reduce((sum, name) => sum + sizeOf(path.join(p, name)), 0);
}

// A .cue is a playlist: FILE "track.bin" BINARY lines name the data files that must travel with it.
export function cueCompanions(cuePath) {
  if (!/\.cue$/i.test(cuePath) || !fs.existsSync(cuePath)) return [];
  const dir = path.dirname(cuePath);
  const names = [...fs.readFileSync(cuePath, "latin1").matchAll(/^\s*FILE\s+"([^"]+)"/gim)].map((m) => m[1]);
  return [...new Set(names)].map((n) => path.join(dir, path.basename(n))).filter((f) => fs.existsSync(f));
}

// Move (or copy) a picked game file into its drop folder. Returns { name, bytes }.
export function placeFile(src, destDir, { name, mode = "move", outDir, keep = [] }) {
  if (/[\/\\]bios[\/\\][^\/\\]+$/i.test(src) && fs.existsSync(path.join(path.dirname(src), "vault.json"))) mode = "copy"; // vault files are never moved out
  // Files from the user's own game-file library are never moved out of it either.
  if (keep.some((k) => k && path.resolve(src).startsWith(path.resolve(k) + path.sep))) mode = "copy";
  const companions = cueCompanions(src);
  const placed = placeOne(src, destDir, { name, mode, outDir });
  for (const c of companions) placed.bytes += placeOne(c, destDir, { mode, outDir }).bytes;
  if (companions.length) placed.companions = companions.map((c) => path.basename(c));
  return placed;
}

function placeOne(src, destDir, { name, mode = "move", outDir }) {
  if (!fs.existsSync(src)) throw new Error(`Picked file no longer exists: ${src}`);
  const staged = outDir && path.resolve(src).startsWith(path.join(path.resolve(outDir), ".decomp-buddy-staging") + path.sep);
  if (outDir && !staged && path.resolve(src).startsWith(path.resolve(outDir) + path.sep)) throw new Error(`Pick a file outside the output folder: ${src}`);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, name || path.basename(src));
  const bytes = sizeOf(src);
  const isDir = fs.statSync(src).isDirectory();
  if (mode === "move") {
    try { fs.renameSync(src, dest); }
    catch (err) {
      if (err.code !== "EXDEV") throw err; // other volume: copy then delete
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    }
  } else {
    isDir ? fs.cpSync(src, dest, { recursive: true }) : fs.copyFileSync(src, dest);
  }
  return { name: path.basename(dest), bytes };
}

export async function setupGame({ plan, ctx, outDir, picks = {}, verifications = {}, artworkPath = null, target = "windows", mode = "move", log = () => {}, keep = [], statfs, ctrl = null } = {}) {
  const T = targetOf(target);
  const dir = path.join(outDir, gameFolderName(plan));
  // Disk space first: the release (zip + its unpacked copy) plus any game files we'll copy in.
  {
    const rel = (ctx.releases || []).flatMap((r) => r.assets).find((a) => a.name === plan.build?.release_asset);
    const pickBytes = Object.values(picks).reduce((n, p) => { try { return n + sizeOf(p); } catch { return n; } }, 0);
    const need = Math.ceil(((rel?.size || 0) * 2 + (mode === "copy" ? pickBytes : 0)) * 1.1);
    const free = freeBytes(fs.existsSync(outDir) ? outDir : path.dirname(outDir), statfs);
    if (free !== null && need > free) throw new Error(`Not enough space for ${plan.game_title}: needs about ${fmtGB(need)}, ${fmtGB(free)} free where ${path.basename(outDir)} lives.`);
  }
  fs.mkdirSync(dir, { recursive: true });
  log(`Folder: ${dir}`);
  let previous = null;
  try { previous = upgradeManifest(JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), "utf8"))); } catch {}
  if (previous) log(`Updating existing set-up${previous.release?.tag ? ` (${previous.release.tag})` : ""} - your game files stay put.`);

  let status = "ready";
  let statusDetail = "";
  const w = plan.build;

  let release = null;
  let downloadVerified = null;
  const releaseEntries = [];
  if (w.method === "release") {
    release = (ctx.releases || []).find((r) => (w.release_tag ? r.tag === w.release_tag : true) && r.assets.some((a) => a.name === w.release_asset))
      || (ctx.releases || []).find((r) => r.assets.some((a) => a.name === w.release_asset)) || null;
    const asset = release?.assets.find((a) => a.name === w.release_asset);
    const wrong = asset && assetMismatch(asset.name, target);
    if (wrong) {
      status = "unsupported";
      statusDetail = `The only build the docs point at (${asset.name}) is ${wrong}, not a ${T.label} one.`;
      log(`! ${statusDetail}`);
    } else if (!asset) {
      status = "needs_attention";
      statusDetail = `Claude picked release asset "${w.release_asset}" but it isn't in the release.`;
      log(`! ${statusDetail}`);
    } else if (!/\.(zip|7z|tar|tgz|tar\.gz|tar\.xz|tar\.bz2|tar\.zst|dmg)$/i.test(asset.name)) {
      const dest = path.join(dir, asset.name);
      log(`Downloading ${asset.name}…`);
      downloadVerified = (await download(asset.url, dest, log, { digest: asset.digest, ctrl })).verified;
      status = "needs_attention";
      statusDetail = `Downloaded ${asset.name} but that format isn't auto-extracted. Unpack it by hand on ${T.where}.`;
    } else {
      const dest = path.join(dir, asset.name);
      log(`Downloading ${asset.name}…`);
      downloadVerified = (await download(asset.url, dest, log, { digest: asset.digest, ctrl })).verified;
      // Updating: keep the old release for Roll Back, and keep your game files out of the swap.
      const placedBefore = (previous?.plan?.game_files || []).filter((f) => f.placed).map((f) => path.join(dir, f.drop_into || "Game Files", f.placed.name));
      const unstash = stashPlaced(dir, placedBefore);
      try {
        if (previous?.release?.tag && previous.release.tag !== release.tag) {
          if (previous.release.files?.length) keepVersion(dir, previous.release.tag, previous.release.files, { log });
          else log(`(${previous.release.tag} was set up before versions were kept - it can't be rolled back to.)`);
        }
        log(`Extracting…`);
        const n = extractZip(dest, dir, { entries: releaseEntries });
        log(`Extracted ${n} entries.`);
      } finally { unstash(); fs.rmSync(dest, { force: true }); }
    }
  } else if (w.method === "source") {
    const srcDir = path.join(dir, "Source");
    const zipPath = path.join(dir, "source.zip");
    log(`No ${T.label} build published - downloading source…`);
    await download(ctx.zipballUrl, zipPath, log);
    extractZip(zipPath, srcDir);
    fs.rmSync(zipPath);
    const steps = w.build_steps.map((s, i) => `${i + 1}. ${s}`);
    fs.writeFileSync(path.join(dir, T.buildDoc), [
      `This project has no prebuilt ${T.label} download, so it has to be built on ${T.where}.`,
      ``,
      `Tools needed: ${w.required_tools.join(", ") || "see project docs"}`,
      ``,
      `Source is in the "Source" folder. Steps:`,
      ...steps,
      ``,
      `Project: ${ctx.url}`,
    ].join("\n"));
    status = "needs_build";
    statusDetail = `No prebuilt ${T.label} download - build on ${T.where} first (see ${T.buildDoc}).`;
  } else if (w.method === "web_only") {
    status = "unsupported";
    statusDetail = `Browser-only project${ctx.homepage ? ` - play it at ${ctx.homepage}` : ""}. Nothing to install.`;
  } else {
    status = "unsupported";
    statusDetail = `No ${T.label} path found in the docs.`;
  }

  if (status !== "unsupported") {
    plan.game_files.forEach((file, i) => {
      const target = path.join(dir, file.drop_into || "Game Files");
      if (!path.resolve(target).startsWith(path.resolve(dir))) throw new Error(`Bad drop folder: ${file.drop_into}`);
      const pick = picks[i];
      const v = verifications[i];
      if (v) { file.verification = { status: v.status, summary: v.summary, detected: v.detected || null }; if (v.status === "mismatch") log(`! ${file.label}: ${v.summary}`); }
      else delete file.verification;
      const kept = !pick && previous?.plan?.game_files?.find((o) => o.placed && (o.drop_into || "Game Files") === (file.drop_into || "Game Files") && fs.existsSync(path.join(target, o.placed.name)));
      if (kept) {
        file.placed = kept.placed;
        if (kept.verification && !v) file.verification = kept.verification;
        fs.rmSync(path.join(target, "PUT GAME FILE HERE.txt"), { force: true });
        log(`Kept ${kept.placed.name} in ${path.relative(outDir, target)}`);
      } else if (pick) {
        file.placed = placeFile(pick, target, { name: file.expected_filename, mode, outDir, keep });
        fs.rmSync(path.join(target, "PUT GAME FILE HERE.txt"), { force: true });
        log(`Placed ${file.label} → ${path.relative(outDir, path.join(target, file.placed.name))} (${fmtBytes(file.placed.bytes)})`);
      } else {
        delete file.placed;
        writePlaceholder(target, file);
        log(`Drop folder: ${path.relative(outDir, target)}`);
      }
    });
  }

  if (status !== "unsupported" && (artworkPath || plan.artwork_url)) {
    try {
      let art = artworkPath && fs.existsSync(artworkPath) ? artworkPath : null;
      if (!art) {
        const url = /^https?:\/\//i.test(plan.artwork_url) ? plan.artwork_url : `${ctx.rawBase || `https://raw.githubusercontent.com/${ctx.fullName}/${ctx.defaultBranch}/`}${plan.artwork_url.replace(/^\.?\//, "")}`;
        art = path.join(dir, ".artwork-download");
        await download(url.replace(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\//, "https://raw.githubusercontent.com/$1/"), art, () => {});
      }
      await applyFolderArtwork(dir, art, { log, target });
      // Keep a copy in the folder: the Library shelf and Steam grid art read it later.
      fs.copyFileSync(art, path.join(dir, "artwork" + (/\.(jpe?g)$/i.test(art) ? ".jpg" : ".png")));
      if (art.endsWith(".artwork-download")) fs.rmSync(art, { force: true });
    } catch (err) { log(`Folder artwork skipped: ${err.message}`); }
  }

  const manifest = {
    decompBuddyVersion: 1,
    setUpAt: new Date().toISOString(),
    target,
    repo: ctx.fullName,
    repoUrl: ctx.url,
    release: release ? { tag: release.tag, url: release.url, files: releaseEntries.length ? releaseEntries : previous?.release?.files || [] } : null,
    downloadVerified,
    previousTag: previous?.release?.tag && previous.release.tag !== release?.tag ? previous.release.tag : null,
    folder: path.basename(dir),
    status,
    statusDetail,
    plan,
    // What the player set or earned on the old copy survives the update.
    ...Object.fromEntries(USER_FIELDS.filter((k) => previous?.[k] !== undefined).map((k) => [k, previous[k]])),
  };
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2));
  return manifest;
}
