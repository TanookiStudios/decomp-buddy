import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listMods, addModFile, setModEnabled, packLinks } from "../src/mods.js";

test("mods: add, list, enable/disable for a folder-method port; in-app ports refuse toggles", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "mods-")), game = path.join(d, "Game"); fs.mkdirSync(game);
  const src = path.join(d, "hd.rtz"); fs.writeFileSync(src, "pack");
  addModFile(game, src);
  const folderPort = { supported: true, method: "folder", folder: "mods", formats: [".rtz"] };
  assert.deepEqual(listMods(game, folderPort), [{ name: "hd.rtz", enabled: false, inMods: true }]);
  setModEnabled(game, folderPort, "hd.rtz", true);
  assert.ok(fs.existsSync(path.join(game, "mods", "hd.rtz")));
  assert.equal(listMods(game, folderPort)[0].enabled, true);
  setModEnabled(game, folderPort, "hd.rtz", false);
  assert.ok(fs.existsSync(path.join(game, "mods", "disabled", "hd.rtz")));
  assert.throws(() => setModEnabled(game, { method: "in_app" }, "hd.rtz", true), /mod menu/);
  assert.equal(listMods(game, { method: "in_app" })[0].enabled, null);
});

test("pack pages: direct archive links are found (evilgames.eu-style)", async () => {
  const links = await packLinks("https://evilgames.eu/texture-packs/bk-reloaded.htm").catch(() => null);
  if (!links) return; // offline
  assert.ok(links.length >= 1);
  assert.ok(links.every((l) => /^https:\/\/evilgames\.eu\/files\//.test(l.url)));
});
