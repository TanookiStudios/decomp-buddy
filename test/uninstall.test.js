import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { romsOf, moveRomsOut } from "../src/uninstall.js";

function game(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "uninstall-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const folder = path.join(root, "Games", "Sonic Mania");
  fs.mkdirSync(path.join(folder, "Game Files"), { recursive: true });
  fs.mkdirSync(path.join(folder, "bios"), { recursive: true });
  fs.writeFileSync(path.join(folder, "Game Files", "game.cue"), 'FILE "game.bin" BINARY');
  fs.writeFileSync(path.join(folder, "Game Files", "game.bin"), "disc");
  fs.writeFileSync(path.join(folder, "bios", "scph.bin"), "bios");
  fs.writeFileSync(path.join(folder, "secret.txt"), "outside the game files");
  const manifest = { plan: { game_title: "Sonic Mania", game_files: [
    { placed: { name: "game.cue", companions: ["game.bin"] } },
    { drop_into: "bios", placed: { name: "scph.bin" } },
    { placed: { name: "gone.iso" } },                            // removed by hand since: skipped
    { drop_into: "../..", placed: { name: "secret.txt" } },       // a plan pointing outside the folder: never touched
    { label: "not placed yet" },
  ] } };
  return { root, folder, manifest, keep: path.join(root, "Kept") };
}

test("uninstall: finds only the placed files inside the game folder", (t) => {
  const { folder, manifest } = game(t);
  assert.deepEqual(romsOf(folder, manifest).map((p) => path.relative(folder, p)).sort(), [path.join("Game Files", "game.bin"), path.join("Game Files", "game.cue"), path.join("bios", "scph.bin")].sort());
});

test("uninstall: Move Rom Out Safely keeps a .cue with its tracks and never overwrites", (t) => {
  const { folder, manifest, keep } = game(t);
  fs.mkdirSync(path.join(keep, "Sonic Mania"), { recursive: true });
  fs.writeFileSync(path.join(keep, "Sonic Mania", "game.cue"), "kept last time");
  const r = moveRomsOut(folder, manifest, keep);
  assert.equal(r.dir, path.join(keep, "Sonic Mania (2)"));
  assert.deepEqual(fs.readdirSync(r.dir).sort(), ["game.bin", "game.cue", "scph.bin"]);
  assert.equal(fs.readFileSync(path.join(keep, "Sonic Mania", "game.cue"), "utf8"), "kept last time");
  assert.equal(romsOf(folder, manifest).length, 0);
  assert.ok(fs.existsSync(path.join(folder, "secret.txt")));
});

test("uninstall: nothing placed means nothing moved and no empty folder", (t) => {
  const { folder, keep } = game(t);
  assert.deepEqual(moveRomsOut(folder, { plan: { game_files: [] } }, keep), { dir: null, files: [] });
  assert.equal(fs.existsSync(keep), false);
});
