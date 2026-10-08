import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { applyPatchFile, patchedName, freeName, describePatch } from "../src/patch.js";

const require = createRequire(import.meta.url);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "db-patch-"));
// Build real patches with the vendored library's own creator, from two synthetic ROMs.
function makePatch(dir, format, original, modified) {
  applyPatchFile; // loads the library's globals
  const R = require("../src/vendor/rom-patcher/RomPatcher.js");
  const a = path.join(dir, "a.bin"), b = path.join(dir, "b.bin"); fs.writeFileSync(a, original); fs.writeFileSync(b, modified);
  const p = R.createPatch(new globalThis.BinFile(a), new globalThis.BinFile(b), format);
  const file = path.join(dir, `hack.${format}`);
  const bin = p.export("hack"); fs.writeFileSync(file, Buffer.from(bin._u8array));
  return file;
}
const rom = (n = 65536) => { const b = Buffer.alloc(n); for (let i = 0; i < b.length; i++) b[i] = (i * 7) & 255; return b; };
const hacked = (n) => { const b = rom(n); b.write("DECOMP BUDDY!", 0x100); b[0xff00] = 0x42; return b; };

for (const format of ["ips", "bps", "ups"]) {
  test(`${format}: applies to a new file and leaves the original alone`, () => {
    const d = tmp(); const p = makePatch(d, format, rom(), hacked());
    const r0 = path.join(d, "Game.sfc"); fs.writeFileSync(r0, rom());
    const r = applyPatchFile(r0, p, patchedName(r0));
    assert.equal(path.basename(r.out), "Game (patched).sfc");
    assert.ok(fs.readFileSync(r.out).equals(hacked()));
    assert.ok(fs.readFileSync(r0).equals(rom()), "original untouched");
    assert.equal(r.validated, format === "ips" ? null : true);
    assert.match(describePatch(r, p), format === "ips" ? /can't confirm/ : /exact ROM/);
  });
}

test("bps refuses the wrong ROM, and strips a copier header when that's what's wrong", () => {
  const N = 262144; // SNES copier headers are detected on 256 KB-multiple ROMs + 512 bytes
  const d = tmp(); const p = makePatch(d, "bps", rom(N), hacked(N));
  const wrong = path.join(d, "Other.sfc"); const w = rom(N); w[5] ^= 1; fs.writeFileSync(wrong, w);
  assert.throws(() => applyPatchFile(wrong, p, patchedName(wrong)), /different version/);
  const headered = path.join(d, "Headered.smc"); fs.writeFileSync(headered, Buffer.concat([Buffer.alloc(512), rom(N)]));
  const r = applyPatchFile(headered, p, patchedName(headered));
  assert.equal(r.headerRemoved, true); assert.ok(fs.readFileSync(r.out).equals(hacked(N)));
});

test("not a patch -> a plain message; names never overwrite", () => {
  const d = tmp(); const r0 = path.join(d, "g.bin"); fs.writeFileSync(r0, rom()); const junk = path.join(d, "x.ips"); fs.writeFileSync(junk, "hello world");
  assert.throws(() => applyPatchFile(r0, junk, patchedName(r0)), /isn't a patch format/);
  const want = path.join(d, "G (patched).sfc"); fs.writeFileSync(want, "x");
  assert.equal(path.basename(freeName(want)), "G (patched 2).sfc");
});
