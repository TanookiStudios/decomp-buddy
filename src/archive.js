// Picked a .zip/.7z/.rar instead of the ROM? Unpack it and find the game file inside.
// 7za (7zip-bin) does 7z/zip/gz/bz2/xz/tar/cab; RAR goes through a WASM unrar.

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { cueCompanions } from "./setup.js";

const require = createRequire(import.meta.url);
const run = promisify(execFile);

export const ARCHIVE_EXT = /\.(zip|7z|rar|gz|tgz|bz2|tbz2?|xz|txz|tar|cab|z)$/i;
export const isArchive = (file) => ARCHIVE_EXT.test(file);

export function path7za() {
  // Inside a packaged app the binary lives outside the asar (see build.asarUnpack).
  return require("7zip-bin").path7za.replace("app.asar", "app.asar.unpacked");
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (!/^(\.|__MACOSX)/.test(e.name)) out.push(p);
  }
  return out;
}

async function extractRar(file, dest) {
  const { createExtractorFromFile } = await import("node-unrar-js");
  const extractor = await createExtractorFromFile({ filepath: file, targetPath: dest });
  const { files } = extractor.extract({});
  for (const f of files) if (f.fileHeader.flags.encrypted) throw new Error("This RAR is password-protected.");
}

// Extracts everything into dest. tar.gz and friends need two passes (gz -> tar -> files).
export async function extractArchive(file, dest, { log = () => {} } = {}) {
  fs.mkdirSync(dest, { recursive: true });
  log(`Unpacking ${path.basename(file)}…`);
  if (/\.rar$/i.test(file)) await extractRar(file, dest);
  else {
    await run(path7za(), ["x", "-y", "-bd", `-o${dest}`, file], { maxBuffer: 16 * 1024 * 1024 });
    for (const inner of walk(dest).filter((p) => /\.tar$/i.test(p))) {
      await run(path7za(), ["x", "-y", "-bd", `-o${dest}`, inner], { maxBuffer: 16 * 1024 * 1024 });
      fs.rmSync(inner);
    }
  }
  const files = walk(dest);
  if (!files.length) throw new Error(`${path.basename(file)} was empty.`);
  log(`  ${files.length} file(s) unpacked.`);
  return files;
}

// Which unpacked file is the game? expected_filename wins, then accepted formats
// (.cue over .bin so the tracks follow), then the biggest thing in there.
export function resolveGameFile(files, spec = {}) {
  const exts = (spec.accepted_formats || []).map((f) => f.toLowerCase().replace(/^\*?\.?/, ".")).filter((f) => /^\.[a-z0-9]+$/.test(f));
  const byName = spec.expected_filename && files.find((f) => path.basename(f).toLowerCase() === spec.expected_filename.toLowerCase());
  if (byName) return byName;
  const cue = files.find((f) => /\.cue$/i.test(f));
  if (cue && (exts.length === 0 || exts.includes(".cue") || exts.includes(".bin"))) return cue;
  const size = (f) => fs.statSync(f).size;
  const matching = files.filter((f) => exts.includes(path.extname(f).toLowerCase()) && !/\.bin$/i.test(f) || (exts.includes(".bin") && /\.bin$/i.test(f)));
  const pool = matching.length ? matching : files.filter((f) => !/\.(txt|md|nfo|url|html?)$/i.test(f));
  return (pool.length ? pool : files).sort((a, b) => size(b) - size(a))[0];
}

// Unpack a picked archive into <outDir>/.decomp-buddy-staging/<name>/ and return the game file.
export async function stageArchive(file, spec, { outDir, log = () => {} } = {}) {
  const dest = path.join(outDir, ".decomp-buddy-staging", `${Date.now()}-${path.basename(file).replace(/[^\w.-]/g, "_")}`);
  const files = await extractArchive(file, dest, { log });
  const game = resolveGameFile(files, spec);
  const extras = cueCompanions(game).length;
  log(`  Using ${path.relative(dest, game)}${extras ? ` (+${extras} track file(s))` : ""}`);
  return { path: game, stagingDir: dest, count: files.length };
}

export function cleanStaging(outDir) {
  fs.rmSync(path.join(outDir, ".decomp-buddy-staging"), { recursive: true, force: true });
}
