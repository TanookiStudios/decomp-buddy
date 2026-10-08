import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cloudCandidates, gameKey, listCloud, pushToCloud, newerFromElsewhere, mapSavePaths, KEEP_CLOUD } from "../src/savesync.js";
import { backupSaves, restoreSaves } from "../src/saves.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "db-sync-"));

test("cloudCandidates finds iCloud / OneDrive / Dropbox / Google Drive folders that exist", () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, "Library", "Mobile Documents", "com~apple~CloudDocs"), { recursive: true });
  fs.mkdirSync(path.join(home, "Library", "CloudStorage", "GoogleDrive-me@example.com", "My Drive"), { recursive: true });
  fs.mkdirSync(path.join(home, "Dropbox"));
  const c = cloudCandidates({ home, env: {}, platform: "darwin" });
  assert.deepEqual(c.map((x) => x.label), ["iCloud Drive", "Dropbox", "Google Drive"]);
  assert.ok(c[2].path.endsWith("My Drive"));
  assert.deepEqual(cloudCandidates({ home: tmp(), env: {}, platform: "darwin" }), []);
});

test("gameKey is stable and filesystem-safe", () => {
  assert.equal(gameKey("HarbourMasters/Shipwright", "The Legend of Zelda: Ocarina of Time"), "harbourmasters_shipwright__the-legend-of-zelda-ocarina-of-time");
});

test("push keeps the newest, newerFromElsewhere ignores this computer and what we've already seen", () => {
  const root = tmp(), zip = path.join(tmp(), "b.zip"); fs.writeFileSync(zip, "save");
  const k = "a_b__game";
  pushToCloud(zip, root, k, { machine: "Mac-1111", now: new Date("2026-09-20T10:00:00Z") });
  assert.equal(newerFromElsewhere(root, k, { machine: "Mac-1111" }), null, "our own save is not 'from elsewhere'");
  pushToCloud(zip, root, k, { machine: "PC-2222", now: new Date("2026-09-21T10:00:00Z") });
  const o = newerFromElsewhere(root, k, { machine: "Mac-1111" });
  assert.equal(o.machine, "PC-2222"); assert.equal(o.at, "2026-09-21T10:00:00Z");
  assert.equal(newerFromElsewhere(root, k, { machine: "Mac-1111", since: "2026-09-22T00:00:00Z" }), null);
  for (let i = 0; i < KEEP_CLOUD + 3; i++) pushToCloud(zip, root, k, { machine: "Mac-1111", now: new Date(Date.UTC(2026, 8, 22, 0, i)) });
  assert.equal(listCloud(root, k).length, KEEP_CLOUD);
});

test("mapSavePaths lines up folders across computers or refuses", () => {
  const here = [{ path: "/h/a" }, { path: "/h/b" }];
  assert.deepEqual(mapSavePaths([{ path: "C:/a" }, { path: "C:/b" }], here), here);
  assert.deepEqual(mapSavePaths([{ path: "C:/a" }], here), [here[0]]);
  assert.throws(() => mapSavePaths([{ path: "1" }, { path: "2" }, { path: "3" }], here), /don't line up/);
  assert.throws(() => mapSavePaths([{ path: "1" }], []), /isn't known/);
});

test("a save made on another computer restores into this computer's folder", async () => {
  const pcGame = tmp(), pcSaves = path.join(tmp(), "PC Saves"); fs.mkdirSync(pcSaves); fs.writeFileSync(path.join(pcSaves, "file1.sav"), "from the PC");
  const b = await backupSaves(pcGame, [{ path: pcSaves, documented: "%APPDATA%/Game" }], { reason: "after-play" });
  const macGame = tmp(), macSaves = path.join(tmp(), "Mac Saves"); fs.mkdirSync(macSaves); fs.writeFileSync(path.join(macSaves, "file1.sav"), "old mac save");
  const r = await restoreSaves(macGame, b.file, { mapTo: (rec) => mapSavePaths(rec, [{ path: macSaves, documented: "~/Library/Game" }]) });
  assert.deepEqual(r.restored, [macSaves]);
  assert.equal(fs.readFileSync(path.join(macSaves, "file1.sav"), "utf8"), "from the PC");
  assert.ok(fs.readdirSync(path.join(macGame, "Saves Backup")).some((n) => /before-restore/.test(n)), "the Mac's old save was backed up first");
});
