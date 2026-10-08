import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { listMods, addModFile, setModEnabled, applyOrder, findConflicts, resyncEnabled } from "../src/mods.js";
import { presetValues } from "../src/presets.js";
import { modOf } from "../src/gamebanana.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "db-mods2-"));
const zip = (file, entries) => { const z = new AdmZip(); for (const [n, c] of Object.entries(entries)) z.addFile(n, Buffer.from(c)); z.writeZip(file); return file; };
const port = { supported: true, method: "folder", folder: "mods", formats: [".o2r"] };

test("load order prefixes enabled copies, names stay clean, toggles still work", () => {
  const d = tmp(), game = path.join(d, "G"); fs.mkdirSync(game);
  for (const n of ["b.o2r", "a.o2r", "c.o2r"]) { fs.writeFileSync(path.join(d, n), n); addModFile(game, path.join(d, n)); setModEnabled(game, port, n, true); }
  assert.deepEqual(applyOrder(game, port, ["c.o2r", "a.o2r", "b.o2r"]), ["c.o2r", "a.o2r", "b.o2r"]);
  assert.deepEqual(fs.readdirSync(path.join(game, "mods")).filter((n) => n.endsWith(".o2r")).sort(), ["01 - c.o2r", "02 - a.o2r", "03 - b.o2r"]);
  assert.deepEqual(listMods(game, port).map((m) => [m.name, m.enabled, m.order]), [["c.o2r", true, 1], ["a.o2r", true, 2], ["b.o2r", true, 3]]);
  setModEnabled(game, port, "a.o2r", false);
  assert.ok(fs.existsSync(path.join(game, "mods", "disabled", "02 - a.o2r")) || fs.existsSync(path.join(game, "mods", "disabled", "a.o2r")));
  assert.equal(listMods(game, port).find((m) => m.name === "a.o2r").enabled, false);
});

test("conflicts: two packs changing the same file are paired; readmes don't count", () => {
  const d = tmp();
  const a = zip(path.join(d, "A.o2r"), { "textures/link/tunic.png": "1", "readme.txt": "x", "textures/navi.png": "2" });
  const b = zip(path.join(d, "B.o2r"), { "Textures/Link/tunic.png": "3", "readme.txt": "y" });
  const c = path.join(d, "C"); fs.mkdirSync(path.join(c, "textures"), { recursive: true }); fs.writeFileSync(path.join(c, "textures", "navi.png"), "4");
  const r = findConflicts([a, b, c]);
  assert.deepEqual(r.map((x) => [x.a, x.b, x.count]).sort(), [["A.o2r", "B.o2r", 1], ["A.o2r", "C", 1]]);
});

test("resyncEnabled refreshes the enabled copy after a pack update", () => {
  const d = tmp(), game = path.join(d, "G"); fs.mkdirSync(game);
  fs.writeFileSync(path.join(d, "hd.o2r"), "v1"); addModFile(game, path.join(d, "hd.o2r")); setModEnabled(game, port, "hd.o2r", true);
  fs.writeFileSync(path.join(game, "Decomp Buddy Mods", "hd.o2r"), "v2");
  assert.equal(resyncEnabled(game, port), 1);
  assert.equal(fs.readFileSync(path.join(game, "mods", "hd.o2r"), "utf8"), "v2");
});

test("presets fill only the keys a game has, in its own format", () => {
  assert.deepEqual(presetValues("deck", { fullscreen: "False", resolution: "1920x1080", vsync: "0", ultrawide: undefined }), { values: { fullscreen: "True", resolution: "1280x800", vsync: "1" }, skipped: ["ultrawide"] });
  assert.deepEqual(presetValues("window", { fullscreen: "yes", resolution: "2" }).values, { fullscreen: "no" });
  assert.deepEqual(presetValues("tv4k", { resolution: "1920,1080" }).values, { resolution: "3840,2160" });
});

test("GameBanana records are read defensively", () => {
  const m = modOf({ _idRow: 5, _sName: "HD Link", _aSubmitter: { _sName: "Djipi" }, _aPreviewMedia: { _aImages: [{ _sBaseUrl: "https://i", _sFile: "a.jpg", _sFile220: "220-a.jpg" }] }, _tsDateUpdated: 1700000000, _nLikeCount: 3 });
  assert.equal(m.image, "https://i/220-a.jpg"); assert.equal(m.author, "Djipi"); assert.equal(m.url, "https://gamebanana.com/mods/5"); assert.equal(m.updated, "2023-11-14T22:13:20.000Z");
  assert.equal(modOf({ _idRow: 6 }).name, "Untitled");
});
