import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expandSavePath, savePathsFor, backupSaves, restoreSaves, listBackups } from "../src/saves.js";

test("expandSavePath: Windows variables, ~, XDG, relative to the game folder; prose is refused", () => {
  const home = "/home/m", env = {};
  assert.equal(expandSavePath("%LOCALAPPDATA%\\Zelda\\saves", { home, env, platform: "linux" }), "/home/m/AppData/Local/Zelda/saves");
  assert.equal(expandSavePath("~/.config/zelda/saves", { home, env }), "/home/m/.config/zelda/saves");
  assert.equal(expandSavePath("$XDG_DATA_HOME/soh", { home, env }), "/home/m/.local/share/soh");
  assert.equal(expandSavePath("./saves", { gameDir: "/g", home, env }), "/g/saves");
  assert.equal(expandSavePath("Same directory as soh.exe", { gameDir: "/g", home, env }), null);
  assert.equal(expandSavePath("%WEIRDVAR%/x", { home, env }), null);
});

test("savePathsFor keeps this platform's and 'any'", () => {
  const f = { save_paths: [{ platform: "windows", path: "%APPDATA%/x" }, { platform: "linux", path: "~/.x" }, { platform: "any", path: "saves" }] };
  assert.deepEqual(savePathsFor(f, { gameDir: "/g", platform: "linux", home: "/h", env: {} }).map((p) => p.path), ["/h/.x", "/g/saves"]);
});

test("backup then restore puts saves back, and backs up the current ones first", async () => {
  const game = fs.mkdtempSync(path.join(os.tmpdir(), "game-"));
  const saves = path.join(game, "saves"); fs.mkdirSync(saves); fs.writeFileSync(path.join(saves, "slot1.sav"), "good");
  const b = await backupSaves(game, [{ path: saves, documented: "saves" }]);
  assert.ok(fs.existsSync(b.file));
  fs.writeFileSync(path.join(saves, "slot1.sav"), "corrupted"); fs.writeFileSync(path.join(saves, "junk"), "x");
  await restoreSaves(game, b.file);
  assert.equal(fs.readFileSync(path.join(saves, "slot1.sav"), "utf8"), "good");
  assert.equal(fs.existsSync(path.join(saves, "junk")), false);
  assert.equal(listBackups(game).length, 2); // the original + the automatic before-restore one
  assert.equal(await backupSaves(game, [{ path: path.join(game, "nope") }]), null);
});

test("save paths: '<game folder>/x' is relative; the game folder itself is never a save folder", async () => {
  const { savePathsFor } = await import("../src/saves.js");
  const gameDir = path.join(os.tmpdir(), "G");
  const facts = { save_paths: [{ platform: "any", path: "./" }, { platform: "any", path: "<game folder>/data/saves/slot1/" }, { platform: "any", path: os.tmpdir() }] };
  assert.deepEqual(savePathsFor(facts, { gameDir }).map((p) => path.resolve(p.path)), [path.join(gameDir, "data", "saves", "slot1")]);
});
