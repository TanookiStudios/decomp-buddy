import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { playableFromLibrary } from "../src/romindex.js";

test("Game File Finder: games whose own files are all in the library, collections by game, BIOS ignored", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "gff-"));
  const oot = path.join(d, "oot.z64"), mm = path.join(d, "mm.z64");
  fs.writeFileSync(oot, "x"); fs.writeFileSync(mm, "y");
  const idx = { files: { [oot]: { sha1: "aaa" }, [mm]: { sha1: "bbb" }, [path.join(d, "gone.z64")]: { sha1: "ccc" } } };
  const game = (title, sha1, extra = []) => ({ game_title: title, game_files: [{ label: title, kind: "game", expected_hashes: [{ algo: "sha1", value: sha1 }] }, ...extra] });
  const published = { plans: {
    "github:a/soh": { targets: { windows: { games: [game("Ocarina of Time", "AAA", [{ label: "BIOS", kind: "bios", expected_filename: "bios.bin" }])] } } },
    "github:b/two": { targets: { windows: { games: [game("Majora's Mask", "bbb"), game("Other Game", "zzz")] } } },
    "github:c/missing": { targets: { windows: { games: [game("Missing", "ccc")] } } },   // its file was deleted
    "github:d/nofiles": { targets: { windows: { games: [{ game_title: "Free Game", game_files: [] }] } } },
    "github:e/maconly": { targets: { "macos-arm64": { games: [game("Mac Only", "aaa")] } } },
  } };
  const got = playableFromLibrary(published, idx, "windows");
  assert.deepEqual(got.map((g) => g.id), ["github:a/soh", "github:b/two#majora-s-mask"]);
  assert.equal(got[0].files[0].file, "oot.z64");
  assert.deepEqual(playableFromLibrary(published, idx, "macos-x64").map((g) => g.id), ["github:e/maconly"]);   // Intel Mac reads the Apple Silicon plan
  assert.deepEqual(playableFromLibrary(published, { files: {} }, "windows"), []);
});
