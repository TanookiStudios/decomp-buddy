import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { parseDat, addDat, listDats, checkAgainstDats, removeDat } from "../src/dat.js";

const sha1 = (b) => crypto.createHash("sha1").update(b).digest("hex");
const t1 = Buffer.from("track one"), t2 = Buffer.from("track two");
const xml = `<?xml version="1.0"?><datafile><header><name>Sony - PlayStation</name></header>
<game name="Final Fantasy VII (USA) (Disc 1)"><description>x</description>
<rom name="FF7 (Track 1).bin" size="${t1.length}" crc="00000000" sha1="${sha1(t1)}"/>
<rom name="FF7 (Track 2).bin" size="${t2.length}" crc="00000000" sha1="${sha1(t2)}"/></game>
<game name="Tom &amp; Jerry (USA)"><rom name="tj.bin" size="1" sha1="${"a".repeat(40)}"/></game></datafile>`;

test("parseDat reads Logiqx games and roms, unescapes names, refuses non-DATs", () => {
  const d = parseDat(xml);
  assert.equal(d.name, "Sony - PlayStation"); assert.equal(d.games, 2);
  assert.equal(d.bySha1["a".repeat(40)][0], "Tom & Jerry (USA)");
  assert.throws(() => parseDat("<html></html>"), /No games/);
});

test("checkAgainstDats: a cue matches only when every track matches the same game", async () => {
  const datDir = fs.mkdtempSync(path.join(os.tmpdir(), "dats-")), work = fs.mkdtempSync(path.join(os.tmpdir(), "cue-"));
  const src = path.join(work, "ff7.dat"); fs.writeFileSync(src, xml);
  const { id } = addDat(datDir, src); assert.equal(listDats(datDir)[0].games, 2);
  fs.writeFileSync(path.join(work, "a.bin"), t1); fs.writeFileSync(path.join(work, "b.bin"), t2);
  fs.writeFileSync(path.join(work, "g.cue"), `FILE "a.bin" BINARY\n  TRACK 01 MODE2/2352\nFILE "b.bin" BINARY\n  TRACK 02 AUDIO\n`);
  const ok = await checkAgainstDats(datDir, path.join(work, "g.cue"));
  assert.equal(ok.matched, true); assert.equal(ok.game, "Final Fantasy VII (USA) (Disc 1)"); assert.equal(ok.tracks, 2);
  fs.writeFileSync(path.join(work, "b.bin"), "bad dump");
  const bad = await checkAgainstDats(datDir, path.join(work, "g.cue"));
  assert.equal(bad.matched, false); assert.match(bad.note, /1 of 2 tracks/);
  removeDat(datDir, id); assert.equal(await checkAgainstDats(datDir, path.join(work, "g.cue")), null);
});
