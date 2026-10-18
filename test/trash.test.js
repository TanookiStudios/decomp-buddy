import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { moveToTrash } from "../src/trash.js";

test("Linux trash keeps the folder and records where it came from; a second one gets its own name", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "trash-")); const prev = process.env.XDG_DATA_HOME; delete process.env.XDG_DATA_HOME;
  try {
    for (const i of [1, 2]) { const g = path.join(home, "Games", "Ship Of Harkinian"); fs.mkdirSync(g, { recursive: true }); fs.writeFileSync(path.join(g, `save${i}.dat`), "x"); moveToTrash(g, { platform: "linux", home }); assert.equal(fs.existsSync(g), false); }
    const files = path.join(home, ".local/share/Trash/files");
    assert.deepEqual(fs.readdirSync(files).sort(), ["Ship Of Harkinian", "Ship Of Harkinian 2"]);
    assert.ok(fs.existsSync(path.join(files, "Ship Of Harkinian", "save1.dat")));
    assert.match(fs.readFileSync(path.join(home, ".local/share/Trash/info/Ship Of Harkinian.trashinfo"), "utf8"), /Path=.*Ship%20Of%20Harkinian/);
  } finally { if (prev) process.env.XDG_DATA_HOME = prev; fs.rmSync(home, { recursive: true, force: true }); }
});

test("Mac trash moves into ~/.Trash; nothing there throws instead of deleting", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "trash-")); fs.mkdirSync(path.join(home, ".Trash"));
  try {
    const g = path.join(home, "G"); fs.mkdirSync(g);
    moveToTrash(g, { platform: "darwin", home });
    assert.ok(fs.existsSync(path.join(home, ".Trash", "G")));
    assert.throws(() => moveToTrash(path.join(home, "nope"), { platform: "darwin", home }), /Nothing at/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
