// Apply a ROM patch: IPS, BPS, UPS, PPF, APS, RUP, BDF and xdelta/VCDIFF (without secondary
// compression - the rare `xdelta3 -S lzma` patches are refused with a clear message). The work is
// done by Rom Patcher JS (src/vendor/rom-patcher, MIT). The original file is never touched: the
// result is a new file. Patches that record the ROM they were made for (BPS, UPS and most VCDIFF)
// are checked first, and a ROM with a copier header is retried without it.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let RP = null;
function lib() {
  if (!RP) {
    // The vendored code reads these as globals, the way its own CLI sets them up.
    globalThis.HashCalculator ??= require("./vendor/rom-patcher/modules/HashCalculator.js");
    globalThis.BinFile ??= require("./vendor/rom-patcher/modules/BinFile.js");
    RP = require("./vendor/rom-patcher/RomPatcher.js");
  }
  return RP;
}

export const PATCH_EXT = /\.(ips|bps|ups|ppf|aps|rup|bdf|xdelta|vcdiff|delta|mod)$/i;
const FORMAT = (p) => ({ IPS: "IPS", UPS: "UPS", BPS: "BPS", PPF: "PPF", APS: "APS", APSGBA: "APS", RUP: "RUP", BDF: "BDF", PMSR: "PMSR", VCDIFF: "xdelta" })[p?.constructor?.name] || "patch";

// A free name beside `want`: "Game (patched).sfc", then "Game (patched 2).sfc"...
export function freeName(want) {
  if (!fs.existsSync(want)) return want;
  const ext = path.extname(want), base = want.slice(0, -ext.length).replace(/\)$/, "");
  for (let n = 2; ; n++) { const p = `${base} ${n})${ext}`; if (!fs.existsSync(p)) return p; }
}

// -> { out, format, validated: true | false | null (patch can't tell), headerRemoved }
export function applyPatchFile(romPath, patchPath, outPath, { allowMismatch = false } = {}) {
  const R = lib();
  if (fs.statSync(romPath).size > 512 * 1024 * 1024) throw new Error("That file is too big to patch here (over 512 MB) - patches are for cartridge-sized ROMs.");
  const patch = R.parsePatchFile(new globalThis.BinFile(patchPath));
  if (!patch) throw new Error(`${path.basename(patchPath)} isn't a patch format Decomp Buddy knows (IPS, BPS, UPS, PPF, APS or xdelta).`);
  const format = FORMAT(patch);
  let rom = new globalThis.BinFile(romPath), headerRemoved = false;
  const checks = typeof patch.validateSource === "function";
  let validated = checks ? R.validateRom(rom, patch) : null;
  if (checks && !validated && R.isRomHeadered(rom)) {
    const bare = R.removeHeader(rom).rom;
    if (R.validateRom(bare, patch)) { rom = bare; validated = true; headerRemoved = true; }
  }
  if (validated === false && !allowMismatch) throw new Error(`${path.basename(patchPath)} was made for a different version of this game - the ${format} patch's checksum doesn't match ${path.basename(romPath)}.`);
  let patched;
  try { patched = patch.apply(rom); }
  catch (err) { throw new Error(/secondary|compress/i.test(err.message) ? "This xdelta patch uses extra compression Decomp Buddy can't unpack - apply it with xdelta3 itself." : `The patch couldn't be applied: ${err.message}`); }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const out = freeName(outPath);
  fs.writeFileSync(out, Buffer.from(patched._u8array.buffer, patched._u8array.byteOffset, patched.fileSize ?? patched._u8array.length));
  return { out, format, validated, headerRemoved };
}

export const patchedName = (romPath, dir = path.dirname(romPath)) => { const ext = path.extname(romPath); return path.join(dir, `${path.basename(romPath, ext)} (patched)${ext}`); };
export function describePatch(r, patchPath) {
  return `patched with ${path.basename(patchPath)} (${r.format}${r.validated === true ? ", made for this exact ROM" : r.validated === null ? ", this format can't confirm the ROM" : ", ROM mismatch accepted"}${r.headerRemoved ? ", copier header removed" : ""})`;
}
