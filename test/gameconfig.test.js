import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig, writeConfig } from "../src/gameconfig.js";

const keys = { fullscreen: "fullscreen", resolution: "window_size", ultrawide: null, vsync: "vsync" };
test("toml/ini: line edits keep comments, quoting and unknown keys", () => {
  const toml = `# my settings\n[graphics]\nfullscreen = false # toggle\nwindow_size = "1280x720"\nmystery = 42\nvsync=true\n`;
  assert.deepEqual(readConfig(toml, "toml", keys), { fullscreen: "false", resolution: "1280x720", vsync: "true" });
  const out = writeConfig(toml, "toml", keys, { fullscreen: true, resolution: "2560x1080" });
  assert.equal(out, `# my settings\n[graphics]\nfullscreen = true # toggle\nwindow_size = "2560x1080"\nmystery = 42\nvsync=true\n`);
  assert.throws(() => writeConfig("a = 1\n", "ini", keys, { fullscreen: true }), /start the game once/);
});
test("json: nested keys found, types kept, indent kept", () => {
  const json = `{\n    "Window": { "fullscreen": false, "window_size": "800x600" },\n    "vsync": 1\n}\n`;
  const out = JSON.parse(writeConfig(json, "json", keys, { fullscreen: "true", vsync: "0" }));
  assert.equal(out.Window.fullscreen, true); assert.equal(out.vsync, 0);
  assert.ok(writeConfig(json, "json", keys, { vsync: 1 }).startsWith("{\n    "));
});
test("yaml", () => {
  assert.equal(writeConfig("fullscreen: no\nother: 1\n", "yaml", keys, { fullscreen: "yes" }), "fullscreen: yes\nother: 1\n");
});
