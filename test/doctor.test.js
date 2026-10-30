import { test } from "node:test";
import assert from "node:assert/strict";
import { logHint, lacksExecBit } from "../src/doctor.js";

test("reads the usual reasons a port won't start", () => {
  assert.equal(logHint("Error: The code execution cannot proceed because MSVCP140.dll was not found.").kind, "runtime");
  assert.equal(logHint("Application error 0xc000007b").kind, "runtime");
  assert.equal(logHint("[error] vkCreateInstance failed: VK_ERROR_INCOMPATIBLE_DRIVER").kind, "graphics");
  assert.equal(logHint("SDL: Failed to create renderer: No suitable GPU").kind, "graphics");
  assert.equal(logHint("fopen: Permission denied").kind, "permission");
  assert.equal(logHint("baserom.z64 not found in the game folder").kind, "gamefile");
  assert.equal(logHint("Couldn't open zelda.z64").kind, "gamefile");
  assert.equal(logHint("Loaded 42 textures\nGoodbye"), null);
  assert.equal(logHint(""), null);
});

test("a program without permission to run", () => {
  assert.equal(lacksExecBit(0o644, "linux"), true);
  assert.equal(lacksExecBit(0o755, "darwin"), false);
  assert.equal(lacksExecBit(0o644, "win32"), false);
});
