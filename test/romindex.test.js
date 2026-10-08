import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { scanLibrary, findInLibrary, readIndex, listRomFiles } from "../src/romindex.js";

test("scanLibrary: indexes rom-like files, rescans only what changed, drops what's gone", async () => {
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), "lib-")), idxFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "idx-")), "romindex.json");
  fs.mkdirSync(path.join(lib, "N64"));
  fs.writeFileSync(path.join(lib, "N64", "game.z64"), Buffer.alloc(0x100, 1));
  fs.writeFileSync(path.join(lib, "notes.txt"), "x");
  fs.writeFileSync(path.join(lib, "other.iso"), "iso");
  assert.equal(listRomFiles([lib]).length, 2);
  let calls = 0; const hash = async (p, algos) => { calls++; const b = fs.readFileSync(p); return { sha1: crypto.createHash("sha1").update(b).digest("hex"), md5: crypto.createHash("md5").update(b).digest("hex"), crc32: "00000000" }; };
  let r = await scanLibrary([lib], idxFile, { hash });
  assert.equal(r.total, 2); assert.equal(calls, 2);
  r = await scanLibrary([lib], idxFile, { hash }); assert.equal(calls, 2); // nothing changed, nothing re-hashed
  fs.rmSync(path.join(lib, "other.iso"));
  r = await scanLibrary([lib], idxFile, { hash }); assert.equal(r.total, 1);
  const idx = readIndex(idxFile);
  const sha1 = crypto.createHash("sha1").update(Buffer.alloc(0x100, 1)).digest("hex");
  assert.match(findInLibrary(idx, { expected_hashes: [{ algo: "sha1", value: sha1.toUpperCase() }] }).why, /published hash/);
  assert.equal(findInLibrary(idx, { expected_filename: "GAME.Z64" }).path, path.join(lib, "N64", "game.z64"));
  assert.equal(findInLibrary(idx, { label: "Majora's Mask ROM" }), null); // no confident evidence, no auto-fill
  assert.equal(findInLibrary(idx, { kind: "bios", expected_filename: "game.z64" }), null);
});
