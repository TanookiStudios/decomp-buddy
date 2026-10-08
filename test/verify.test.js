import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { identify, hashFile, verifyPick, checkBios, gbaChecksum } from "../src/verify.js";
import { GBA_BIOS_CHECKSUM } from "../src/bios-table.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "verify-"));
const write = (dir, name, buf) => { const p = path.join(dir, name); fs.writeFileSync(p, buf); return p; };

function n64(title, code, version = 0) {
  const b = Buffer.alloc(4096);
  b.writeUInt32BE(0x80371240, 0);
  b.write(title, 0x20, "latin1"); b.write(code, 0x3B, "latin1"); b[0x3F] = version;
  return b;
}
const spec = (over = {}) => ({ label: "ROM", description: "", accepted_formats: [], expected_filename: null, how_provided: "folder", drop_into: "Game Files", notes: null, kind: "game", expected_region: "unknown", required_version: null, expected_hashes: [], expected_size: null, expected_serial: null, ...over });

test("identifies N64 headers in all three byte orders", () => {
  const d = tmp();
  const be = n64("SUPER MARIO 64", "NSME");
  assert.deepEqual(identify(write(d, "a.z64", be)), { system: "Nintendo 64", title: "SUPER MARIO 64", gameCode: "NSME", region: "USA", version: "v1.0" });
  assert.equal(identify(write(d, "b.v64", Buffer.from(be).swap16())).gameCode, "NSME");
  assert.equal(identify(write(d, "c.n64", Buffer.from(be).swap32())).region, "USA");
  assert.equal(identify(write(d, "j.z64", n64("SUPER MARIO 64", "NSMJ", 1))).region, "Japan");
  assert.equal(identify(write(d, "junk.z64", Buffer.alloc(64))), null);
});

test("identifies GBA, NDS, GameCube and PS1", () => {
  const d = tmp();
  const gba = Buffer.alloc(0xC0); gba.write("METROID4USA", 0xA0, "latin1"); gba.write("AMTE", 0xAC, "latin1"); gba[0xB2] = 0x96; gba[0xBC] = 0;
  assert.equal(identify(write(d, "m.gba", gba)).gameCode, "AMTE");
  assert.equal(identify(write(d, "m.gba", gba)).region, "USA");
  const nds = Buffer.alloc(0x20); nds.write("NEW SUPER MA", 0, "latin1"); nds.write("A2DJ", 0x0C, "latin1");
  assert.equal(identify(write(d, "n.nds", nds)).region, "Japan");
  const gc = Buffer.alloc(0x60); gc.write("GXSE01", 0, "latin1"); gc.writeUInt32BE(0xC2339F3D, 0x1C); gc.write("Super Mario Strikers", 0x20, "latin1");
  assert.deepEqual(identify(write(d, "s.iso", gc)), { system: "Nintendo GameCube", title: "Super Mario Strikers", gameCode: "GXSE01", region: "USA", version: "v1.0" });
  const ps1 = Buffer.alloc(200_000); ps1.write("BOOT = cdrom:\\SLUS_009.42;1", 100_000, "latin1");
  const bin = write(d, "sm.bin", ps1);
  assert.equal(identify(bin).gameCode, "SLUS-00942");
  assert.equal(identify(bin).region, "USA");
  const cue = write(d, "sm.cue", 'FILE "sm.bin" BINARY\n');
  assert.equal(identify(cue).region, "USA");
  assert.equal(identify(write(d, "x.rvz", Buffer.alloc(10))).system, "compressed");
});

test("hashFile matches known digests", async () => {
  const f = write(tmp(), "abc.txt", "abc");
  const h = await hashFile(f, ["sha1", "md5", "crc32"]);
  assert.equal(h.sha1, "a9993e364706816aba3e25717850c26c9cd0d89d");
  assert.equal(h.md5, "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(h.crc32, "352441c2");
});

test("verifyPick: hash match, hash mismatch, region mismatch, unverified", async () => {
  const d = tmp();
  const rom = write(d, "sm64.z64", n64("SUPER MARIO 64", "NSME"));
  const { sha1 } = await hashFile(rom, ["sha1"]);
  let r = await verifyPick(rom, spec({ expected_region: "USA", expected_hashes: [{ algo: "sha1", value: sha1.toUpperCase() }] }));
  assert.equal(r.status, "match");
  r = await verifyPick(rom, spec({ expected_region: "USA", expected_hashes: [{ algo: "sha1", value: "9bef1128717f958171a4afac3ed78ee2bb4e86ce" }] }));
  assert.equal(r.status, "mismatch"); assert.match(r.summary, /published hash/);
  r = await verifyPick(write(d, "j.z64", n64("SUPER MARIO 64", "NSMJ")), spec({ expected_region: "USA" }));
  assert.equal(r.status, "mismatch"); assert.match(r.summary, /region is Japan, needs USA/);
  r = await verifyPick(write(d, "mystery.xyz", "??"), spec());
  assert.equal(r.status, "unverified"); assert.match(r.summary, /unknown format/);
  r = await verifyPick(rom, spec({ required_version: "v1.1" }));
  assert.equal(r.status, "mismatch"); assert.match(r.summary, /version is v1.0/);
  r = await verifyPick(rom, spec());
  assert.equal(r.status, "unverified"); assert.match(r.summary, /detected Nintendo 64 "SUPER MARIO 64" NSME \(USA\) v1.0/);
});

test("CUE pick: a published hash matching any track counts", async () => {
  const d = tmp();
  write(d, "t1.bin", "track-one"); write(d, "t2.bin", "track-two");
  const cue = write(d, "g.cue", 'FILE "t1.bin" BINARY\nFILE "t2.bin" BINARY\n');
  const { sha1 } = await hashFile(path.join(d, "t2.bin"), ["sha1"]);
  const r = await verifyPick(cue, spec({ expected_hashes: [{ algo: "sha1", value: sha1 }] }));
  assert.equal(r.status, "match");
});

test("GBA BIOS: word-sum must equal mGBA's constant", async () => {
  const d = tmp();
  const bios = Buffer.alloc(16384);
  bios.writeUInt32LE(GBA_BIOS_CHECKSUM, 0); // sum of words == constant
  assert.equal(gbaChecksum(bios), GBA_BIOS_CHECKSUM);
  const s = spec({ kind: "bios", label: "GBA BIOS", description: "Game Boy Advance BIOS" });
  assert.equal((await checkBios(write(d, "gba_bios.bin", bios), s, () => {})).status, "match");
  bios[0] ^= 1;
  const bad = await checkBios(write(d, "bad_bios.bin", bios), s, () => {});
  assert.equal(bad.status, "mismatch"); assert.match(bad.summary, /GBA BIOS checksum/);
  const ps = await checkBios(write(d, "scph.bin", Buffer.alloc(524288)), spec({ kind: "bios", label: "PS1 BIOS", description: "SCPH-1001" }), () => {});
  assert.equal(ps.status, "mismatch"); assert.match(ps.summary, /PS1 BIOS MD5/);
});

test("BIOS vault keeps only verified files and matches them to plan entries", async () => {
  const { addToVault, readVault, vaultMatch, removeFromVault } = await import("../src/vault.js");
  const d = tmp(), vault = path.join(d, "bios");
  const bios = Buffer.alloc(16384); bios.writeUInt32LE(GBA_BIOS_CHECKSUM, 0);
  const good = write(d, "gba_bios.bin", bios);
  const e = await addToVault(vault, good);
  assert.match(e.identity, /Game Boy Advance/);
  assert.equal(readVault(vault).length, 1);
  await assert.rejects(addToVault(vault, write(d, "junk.bin", Buffer.alloc(16384, 7))), /Not a recognised/);
  const m = vaultMatch(vault, { label: "GBA BIOS", description: "Game Boy Advance BIOS file", kind: "bios" });
  assert.ok(m && fs.existsSync(m.path));
  assert.equal(vaultMatch(vault, { label: "PS1 BIOS", description: "SCPH-1001", kind: "bios" }), null);
  removeFromVault(vault, e.id);
  assert.equal(readVault(vault).length, 0);
});
