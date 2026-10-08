import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { conversionFor, convertN64, convertCiso, convertGcz, convertFile } from "../src/convert.js";
import { identify } from "../src/verify.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "conv-"));

test("conversionFor picks the right converter and nothing when the format is already fine", () => {
  assert.equal(conversionFor("a.z64", [".z64"]), null);
  assert.equal(conversionFor("a.v64", [".z64"]).kind, "n64");
  assert.equal(conversionFor("a.ciso", [".iso", ".gcm"]).kind, "ciso");
  assert.equal(conversionFor("a.gcz", [".iso"]).kind, "gcz");
  assert.equal(conversionFor("a.rvz", [".iso"]).kind, "dolphin");
  assert.equal(conversionFor("a.chd", [".bin", ".cue"]).kind, "chd");
  assert.equal(conversionFor("a.chd", [".iso"]), null);
  assert.equal(conversionFor("a.v64", []), null, "no accepted formats known: leave it");
});

test("N64 byte-swapped ROM becomes big-endian and identifies", () => {
  const d = tmp();
  const rom = Buffer.alloc(8192); rom.writeUInt32BE(0x80371240, 0); rom.write("DIDDY KONG RACING", 0x20, "latin1"); rom.write("NDYE", 0x3B, "latin1");
  fs.writeFileSync(path.join(d, "a.v64"), Buffer.from(rom).swap16());
  fs.writeFileSync(path.join(d, "a.n64"), Buffer.from(rom).swap32());
  convertN64(path.join(d, "a.v64"), path.join(d, "v.z64")); convertN64(path.join(d, "a.n64"), path.join(d, "n.z64"));
  assert.ok(fs.readFileSync(path.join(d, "v.z64")).equals(rom)); assert.ok(fs.readFileSync(path.join(d, "n.z64")).equals(rom));
  assert.equal(identify(path.join(d, "v.z64")).gameCode, "NDYE");
});

test("CISO and GCZ unpack to the original ISO bytes", async () => {
  const d = tmp();
  const block = 2048;
  const iso = Buffer.concat([Buffer.alloc(block, 1), Buffer.alloc(block, 0), Buffer.alloc(block, 3)]); // middle block all zero
  // CISO encode: header + map; zero blocks unmapped
  const head = Buffer.alloc(0x8000); head.write("CISO", 0, "latin1"); head.writeUInt32LE(block, 4); head[8] = 1; head[9] = 0; head[10] = 1;
  fs.writeFileSync(path.join(d, "g.ciso"), Buffer.concat([head, iso.subarray(0, block), iso.subarray(2 * block)]));
  convertCiso(path.join(d, "g.ciso"), path.join(d, "g.iso"));
  assert.ok(fs.readFileSync(path.join(d, "g.iso")).equals(iso));
  // GCZ encode: block 0 compressed, block 1 stored raw (top bit), block 2 compressed
  const blocks = [iso.subarray(0, block), iso.subarray(block, 2 * block), iso.subarray(2 * block)];
  const enc = [zlib.deflateSync(blocks[0]), blocks[1], zlib.deflateSync(blocks[2])];
  const ptrs = Buffer.alloc(24); let off = 0n;
  ptrs.writeBigUInt64LE(off, 0); off += BigInt(enc[0].length);
  ptrs.writeBigUInt64LE(off | (1n << 63n), 8); off += BigInt(enc[1].length);
  ptrs.writeBigUInt64LE(off, 16); off += BigInt(enc[2].length);
  const gh = Buffer.alloc(32); gh.writeUInt32LE(0xb10bc001, 0); gh.writeUInt32LE(0, 4); gh.writeBigUInt64LE(off, 8); gh.writeBigUInt64LE(BigInt(iso.length), 16); gh.writeUInt32LE(block, 24); gh.writeUInt32LE(3, 28);
  fs.writeFileSync(path.join(d, "g.gcz"), Buffer.concat([gh, ptrs, Buffer.alloc(12), ...enc]));
  convertGcz(path.join(d, "g.gcz"), path.join(d, "g2.iso"));
  assert.ok(fs.readFileSync(path.join(d, "g2.iso")).equals(iso));
  const out = await convertFile(path.join(d, "g.gcz"), path.join(d, "o"), { kind: "gcz", to: ".iso" });
  assert.equal(path.basename(out), "g.iso");
});

test("tool-backed conversions explain what to install when the tool is missing", async () => {
  const d = tmp(); fs.writeFileSync(path.join(d, "x.chd"), "");
  const has = (await import("../src/convert.js")).findTool("chdman");
  if (has) return; // tool present here; nothing to prove
  await assert.rejects(convertFile(path.join(d, "x.chd"), d, { kind: "chd", to: ".cue" }), /chdman.*isn't installed.*brew install mame|apt install|mamedev/);
});
