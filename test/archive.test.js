import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import AdmZip from "adm-zip";
import { isArchive, extractArchive, resolveGameFile, stageArchive } from "../src/archive.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "arc-"));

test("recognises archive extensions", () => {
  for (const f of ["a.zip", "b.7Z", "c.rar", "d.tar.gz", "e.tgz", "f.xz"]) assert.ok(isArchive(f), f);
  for (const f of ["a.iso", "b.z64", "c.bin"]) assert.ok(!isArchive(f), f);
});

test("zip: unpacks and picks the ROM by accepted format", async () => {
  const d = tmp();
  const zip = new AdmZip();
  zip.addFile("readme.txt", Buffer.from("read me"));
  zip.addFile("Game (USA)/game.z64", Buffer.alloc(4096, 1));
  zip.addFile("__MACOSX/._game.z64", Buffer.from("junk"));
  const zp = path.join(d, "game.zip"); zip.writeZip(zp);
  const files = await extractArchive(zp, path.join(d, "out"));
  assert.equal(files.length, 2);
  assert.match(resolveGameFile(files, { accepted_formats: [".z64"] }), /game\.z64$/);
  assert.match(resolveGameFile(files, {}), /game\.z64$/, "biggest wins with no hint");
  assert.match(resolveGameFile(files, { expected_filename: "readme.txt" }), /readme\.txt$/);
});

test("7z and tar.gz go through 7za; cue wins over bin", async () => {
  const d = tmp();
  const src = path.join(d, "src"); fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, "Game.cue"), 'FILE "Game.bin" BINARY\n');
  fs.writeFileSync(path.join(src, "Game.bin"), Buffer.alloc(9000, 2));
  const { path7za } = await import("7zip-bin");
  execFileSync(path7za, ["a", "-bd", path.join(d, "g.7z"), path.join(src, "Game.cue"), path.join(src, "Game.bin")], { stdio: "ignore" });
  execFileSync(path7za, ["a", "-bd", "-ttar", path.join(d, "g.tar"), path.join(src, "Game.cue"), path.join(src, "Game.bin")], { stdio: "ignore" });
  execFileSync(path7za, ["a", "-bd", "-tgzip", path.join(d, "g.tar.gz"), path.join(d, "g.tar")], { stdio: "ignore" });
  const f7 = await extractArchive(path.join(d, "g.7z"), path.join(d, "o7"));
  assert.match(resolveGameFile(f7, { accepted_formats: [".bin", ".cue"] }), /Game\.cue$/);
  const ftg = await extractArchive(path.join(d, "g.tar.gz"), path.join(d, "otg"));
  assert.deepEqual(ftg.map((f) => path.basename(f)).sort(), ["Game.bin", "Game.cue"]);
});

test("rar goes through unrar", async () => {
  const d = tmp();
  const files = await extractArchive(new URL("./fixtures/FolderTest.rar", import.meta.url).pathname, path.join(d, "out"));
  assert.ok(files.length > 0);
  assert.ok(files.every((f) => fs.statSync(f).isFile()));
});

test("stageArchive lands in the output folder's staging dir", async () => {
  const d = tmp(), out = tmp();
  const zip = new AdmZip(); zip.addFile("rom.gba", Buffer.alloc(100)); const zp = path.join(d, "r.zip"); zip.writeZip(zp);
  const s = await stageArchive(zp, { accepted_formats: [".gba"] }, { outDir: out });
  assert.ok(s.path.startsWith(path.join(out, ".decomp-buddy-staging")));
  assert.equal(path.basename(s.path), "rom.gba");
});
