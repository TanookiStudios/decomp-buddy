import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installedGames, matchInstall, findInInstall, parseGogRegistry, isStoreInstallPath } from "../src/stores.js";
import { placeFile } from "../src/setup.js";

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "stores-"));
  const steam = path.join(home, ".local", "share", "Steam"), lib2 = path.join(home, "Games2");
  const w = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
  w(path.join(steam, "steamapps", "libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam}" } "1" { "path" "${lib2}" } }`);
  w(path.join(steam, "steamapps", "appmanifest_38410.acf"), `"AppState" { "appid" "38410" "name" "Fallout 2: A Post Nuclear Role Playing Game" "installdir" "Fallout 2" }`);
  w(path.join(steam, "steamapps", "common", "Fallout 2", "MASTER.DAT"), "x");
  w(path.join(lib2, "steamapps", "appmanifest_9010.acf"), `"AppState" { "name" "Return to Castle Wolfenstein" "installdir" "RTCW" }`);
  w(path.join(lib2, "steamapps", "common", "RTCW", "Main", "pak0.pk3"), "x");
  w(path.join(home, ".config", "heroic", "gog_store", "installed.json"), JSON.stringify({ installed: [{ title: "Sid Meier's Civilization II", install_path: path.join(home, "Games", "Heroic", "Civ2") }] }));
  fs.mkdirSync(path.join(home, "Games", "Heroic", "Civ2"), { recursive: true });
  return home;
}

test("lists Steam games in every library, and Heroic's GOG games", () => {
  const home = fakeHome(), got = installedGames({ platform: "linux", home, env: {} });
  assert.deepEqual(got.map((g) => `${g.store}: ${g.name}`).sort(), ["GOG: Sid Meier's Civilization II", "Steam: Fallout 2: A Post Nuclear Role Playing Game", "Steam: Return to Castle Wolfenstein"]);
});

test("matches a game to its install, and never a different game in the series", () => {
  const installs = [{ name: "Fallout 2: A Post Nuclear Role Playing Game" }, { name: "Sid Meier's Civilization II" }, { name: "Return to Castle Wolfenstein" }];
  assert.equal(matchInstall("Fallout 2", installs).name, "Fallout 2: A Post Nuclear Role Playing Game");
  assert.equal(matchInstall("Fallout", installs), null);
  assert.equal(matchInstall("Civilization II", installs).name, "Sid Meier's Civilization II");
  assert.equal(matchInstall("Civilization", installs), null);
  assert.equal(matchInstall("Return to Castle Wolfenstein (iortcw)", installs).name, "Return to Castle Wolfenstein");
  assert.equal(matchInstall("Plants vs. Zombies", [{ name: "Plants vs. Zombies GOTY Edition" }]).name, "Plants vs. Zombies GOTY Edition");
  assert.equal(matchInstall("Plants vs. Zombies", [{ name: "Plants vs. Zombies Garden Warfare" }]), null);
  assert.equal(matchInstall("Doom", [{ name: "DOOM Eternal" }]), null);
});

test("finds the named file in any case, or the whole install for a folder", () => {
  const home = fakeHome(), dir = path.join(home, ".local", "share", "Steam", "steamapps", "common", "Fallout 2");
  assert.equal(path.basename(findInInstall(dir, { expected_filename: "master.dat" })), "MASTER.DAT");
  assert.equal(findInInstall(dir, { expected_filename: "critter.dat" }), null);
  assert.equal(findInInstall(dir, { how_provided: "folder" }), dir);
  assert.equal(findInInstall(dir, { how_provided: "in_app_picker" }), null);
});

test("reads GOG's Windows registry list", () => {
  const reg = "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\GOG.com\\Games\\1207658904\r\n    gameName    REG_SZ    Fallout 2\r\n    path    REG_SZ    C:\\GOG Games\\Fallout 2\r\n\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\GOG.com\\Games\\1\r\n    gameName    REG_SZ    Prey\r\n    path    REG_SZ    D:\\Games\\Prey\r\n";
  assert.deepEqual(parseGogRegistry(reg), [{ name: "Fallout 2", dir: "C:\\GOG Games\\Fallout 2" }, { name: "Prey", dir: "D:\\Games\\Prey" }]);
});

test("a file in a store's game folder is copied even when Move Files is on", () => {
  const home = fakeHome(), src = path.join(home, ".local", "share", "Steam", "steamapps", "common", "Fallout 2", "MASTER.DAT");
  assert.equal(isStoreInstallPath(src), true);
  const out = path.join(home, "out"), dest = path.join(out, "Fallout 2");
  placeFile(src, dest, { name: "master.dat", mode: "move", outDir: out });
  assert.ok(fs.existsSync(src), "the Steam copy is still there");
  assert.ok(fs.existsSync(path.join(dest, "master.dat")));
  // A custom GOG folder the name check can't know: the keep list (setup passes every store install) protects it.
  const custom = path.join(home, "MyGames", "Prey"); fs.mkdirSync(custom, { recursive: true }); fs.writeFileSync(path.join(custom, "base.pk4"), "x");
  placeFile(path.join(custom, "base.pk4"), dest, { mode: "move", outDir: out, keep: [custom] });
  assert.ok(fs.existsSync(path.join(custom, "base.pk4")));
});

import { storeFileFor } from "../src/stores.js";
test("a whole-folder game file is only filled in when exactly one install matches", () => {
  const home = fakeHome(), a = path.join(home, "a"), b = path.join(home, "b"); fs.mkdirSync(a); fs.mkdirSync(b); fs.writeFileSync(path.join(b, "doom.wad"), "x");
  const two = [{ store: "Steam", name: "DOOM", dir: a }, { store: "Steam", name: "DOOM (1993)", dir: b }];
  assert.equal(storeFileFor("Doom", { how_provided: "folder" }, two), null);
  assert.equal(storeFileFor("Doom", { expected_filename: "DOOM.WAD" }, two).path, path.join(b, "doom.wad"));
  assert.equal(storeFileFor("Doom", { how_provided: "folder" }, [two[1]]).path, b);
});
