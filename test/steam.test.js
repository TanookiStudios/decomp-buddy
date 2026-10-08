import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseVdf, writeVdf, shortcutAppId, installShortcut } from "../src/steam.js";

test("binary VDF round-trips and shortcut ids follow Steam's formula", () => {
  const obj = { shortcuts: { 0: { appid: -1234567, AppName: "Skate 3", Exe: '"/g/skate3.exe"', StartDir: '"/g"', tags: { 0: "Decomp Buddy" } } } };
  const buf = writeVdf(obj);
  assert.deepEqual(parseVdf(buf), obj);
  const id = shortcutAppId('"/g/skate3.exe"', "Skate 3");
  assert.ok(id >= 0x80000000 && id <= 0xffffffff);
  assert.equal(shortcutAppId('"/g/skate3.exe"', "Skate 3"), id, "deterministic");
});

test("installShortcut appends, is idempotent, writes grid art", () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), "steam-"));
  fs.writeFileSync(path.join(cfg, "shortcuts.vdf"), writeVdf({ shortcuts: { 0: { appid: 1, AppName: "Existing", Exe: '"/x"', StartDir: '"/"', tags: {} } } }));
  const a = installShortcut({ configDir: cfg, appName: "Skate 3", exe: "/g/skate3.exe", startDir: "/g", artwork: { portrait: Buffer.from("png") } });
  const b = installShortcut({ configDir: cfg, appName: "Skate 3", exe: "/g/skate3.exe", startDir: "/g" });
  assert.equal(a.updated, false); assert.equal(b.updated, true); assert.equal(a.appid, b.appid);
  const data = parseVdf(fs.readFileSync(path.join(cfg, "shortcuts.vdf")));
  assert.equal(Object.keys(data.shortcuts).length, 2);
  assert.equal(data.shortcuts["1"].AppName, "Skate 3");
  assert.equal(data.shortcuts["1"].tags["0"], "Decomp Buddy");
  assert.ok(fs.existsSync(path.join(cfg, "grid", `${a.appid}p.png`)));
});

test("Steam Deck Gaming Mode is detected from gamescope's environment", async () => {
  const { inGamingMode } = await import("../src/targets.js");
  assert.equal(inGamingMode({ SteamDeck: "1", XDG_CURRENT_DESKTOP: "gamescope" }), true);
  assert.equal(inGamingMode({ SteamDeck: "1", XDG_CURRENT_DESKTOP: "KDE" }), false);
  assert.equal(inGamingMode({ XDG_CURRENT_DESKTOP: "gamescope" }), false);
});
