import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { keepVersion, listVersions, rollBack } from "../src/versions.js";
import { extractZip } from "../src/setup.js";

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), "ver-"));
const w = (dir, p, t) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), t); };
const r = (dir, p) => fs.readFileSync(path.join(dir, p), "utf8");
function zipOf(files) { const src = mk(); for (const [p, t] of Object.entries(files)) w(src, p, t); const z = path.join(mk(), "r.zip"); execFileSync("zip", ["-qr", z, "."], { cwd: src }); return z; }

test("update then roll back: the ROM you dropped inside a release folder never moves, whatever the manifest says", () => {
  const dir = mk();
  const v1 = []; extractZip(zipOf({ "game.exe": "v1", "assets/data.bin": "v1data" }), dir, { entries: v1 });
  assert.deepEqual(v1.sort(), ["assets/data.bin", "game.exe"]);
  w(dir, "assets/rom.z64", "MY ROM"); w(dir, "Game Files/x", "mine");
  // update to v2: keep v1's files, extract v2 (merging into assets/, not replacing it)
  keepVersion(dir, "v1", v1);
  const v2 = []; extractZip(zipOf({ "game.exe": "v2", "assets/data.bin": "v2data", "assets/new.bin": "n" }), dir, { entries: v2 });
  assert.equal(r(dir, "assets/rom.z64"), "MY ROM"); assert.equal(r(dir, "game.exe"), "v2");
  assert.equal(r(dir, "Versions/v1/game.exe"), "v1"); assert.equal(fs.existsSync(path.join(dir, "Versions/v1/assets/rom.z64")), false);
  // roll back with NO knowledge of the ROM (placed: []) - it still stays put
  const back = rollBack(dir, { currentTag: "v2", currentFiles: v2, tag: "v1", placed: [] });
  assert.equal(back.tag, "v1");
  assert.equal(r(dir, "game.exe"), "v1"); assert.equal(r(dir, "assets/data.bin"), "v1data"); assert.equal(fs.existsSync(path.join(dir, "assets/new.bin")), false);
  assert.equal(r(dir, "assets/rom.z64"), "MY ROM"); assert.equal(r(dir, "Game Files/x"), "mine");
  assert.deepEqual(listVersions(dir).map((v) => v.tag), ["v2"]);
});

test("roll back never overwrites a file of yours that sits where an old release file was", () => {
  const dir = mk();
  keepVersion(dir, "old", (w(dir, "a.cfg", "old release cfg"), ["a.cfg"]));
  w(dir, "a.cfg", "my edited cfg"); w(dir, "game.exe", "new");
  const back = rollBack(dir, { currentTag: "new", currentFiles: ["game.exe"], tag: "old" });
  assert.equal(r(dir, "a.cfg"), "my edited cfg"); assert.deepEqual(back.files, []);
});

test("two versions kept at most", () => {
  const dir = mk();
  for (const t of ["a", "b", "c"]) { w(dir, "g.exe", t); keepVersion(dir, t, ["g.exe"]); }
  assert.deepEqual(listVersions(dir).map((v) => v.tag).sort(), ["b", "c"]);
});

test("a .dmg unpacks (the app inside is copied out)", { skip: process.platform !== "darwin" }, () => {
  const src = mk(); w(src, "Game.app/Contents/MacOS/game", "bin");
  const dmg = path.join(mk(), "g.dmg"); execFileSync("hdiutil", ["create", "-quiet", "-fs", "HFS+", "-srcfolder", src, "-volname", "G", dmg]);
  const out = mk(); const files = []; extractZip(dmg, out, { entries: files });
  assert.equal(r(out, "Game.app/Contents/MacOS/game"), "bin"); assert.ok(files.includes(path.join("Game.app", "Contents", "MacOS", "game")));
});
