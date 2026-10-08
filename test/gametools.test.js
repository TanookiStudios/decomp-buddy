import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { splitArgs, launchSpec, folderUsage, detectTarget, adoptManifest, checkFolder } from "../src/gametools.js";
import { keepVersion } from "../src/versions.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "db-gt-"));

test("splitArgs keeps quoted words together", () => {
  assert.deepEqual(splitArgs(`-fullscreen --res 1920x1080 --name "My Save" ''`), ["-fullscreen", "--res", "1920x1080", "--name", "My Save", ""]);
  assert.deepEqual(splitArgs("   "), []);
});

test("launchSpec: macOS app waits with open -W and passes --args; .exe gets no shell", () => {
  assert.deepEqual(launchSpec("/G/Zelda.app", { platform: "darwin", args: ["-w"], wait: true }).argv, ["-W", "-a", "/G/Zelda.app", "--args", "-w"]);
  assert.deepEqual(launchSpec("/G/Zelda.app", { platform: "darwin" }).argv, ["-a", "/G/Zelda.app"]);
  const w = launchSpec("C:\\G\\soh.exe", { platform: "win32", args: ["--x"] });
  assert.equal(w.cmd, "C:\\G\\soh.exe"); assert.equal(w.opts.shell, false);
  assert.equal(launchSpec("C:\\G\\run.bat", { platform: "win32" }).opts.shell, true);
});

test("folderUsage lists old versions, spare save backups and unpacked mod archives; never the game", () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, "game.exe"), "x".repeat(1000));
  keepVersion(d, "v1", ["game.exe"]);
  fs.writeFileSync(path.join(d, "game.exe"), "y".repeat(1000));
  fs.mkdirSync(path.join(d, "Saves Backup"));
  for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(d, "Saves Backup", `2026-09-0${i + 1} manual.zip`), "z");
  const dl = path.join(d, "Decomp Buddy Mods", "downloads"); fs.mkdirSync(path.join(dl, "HD Pack"), { recursive: true });
  fs.writeFileSync(path.join(dl, "HD Pack.7z"), "a".repeat(500)); fs.writeFileSync(path.join(dl, "Other.zip"), "b");
  const u = folderUsage(d);
  const kinds = Object.fromEntries(u.reclaim.map((r) => [r.kind, r]));
  assert.equal(kinds.versions.paths.length, 1);
  assert.equal(kinds.saveBackups.paths.length, 2, "newest 3 kept");
  assert.ok(kinds.saveBackups.paths.every((p) => /0[12] manual/.test(p)), "the oldest go");
  assert.deepEqual(kinds.modArchives.paths.map((p) => path.basename(p)), ["HD Pack.7z"], "only archives whose unpacked copy exists");
  assert.ok(!u.reclaim.some((r) => r.paths.some((p) => p.endsWith("game.exe"))));
  assert.ok(u.total >= 2000 && u.reclaimable > 0);
});

test("detectTarget reads a folder's files", () => {
  const w = tmp(); fs.writeFileSync(path.join(w, "unins000.exe"), "x"); fs.writeFileSync(path.join(w, "SoH.exe"), "x");
  assert.equal(detectTarget(w), "windows");
  const m = tmp(); fs.mkdirSync(path.join(m, "Zelda64Recompiled.app", "Contents"), { recursive: true });
  assert.equal(detectTarget(m), "macos-arm64");
  const l = tmp(); const elf = Buffer.alloc(200_000); elf.write("\x7fELF", 0, "latin1"); fs.writeFileSync(path.join(l, "sm64"), elf);
  assert.equal(detectTarget(l), "linux");
  assert.equal(detectTarget(tmp()), null);
});

test("adoptManifest is enough for the Library and checkFolder", () => {
  const d = tmp();
  const m = adoptManifest({ folderName: path.basename(d), game: { owner: "HarbourMasters", repo: "Shipwright", repoUrl: "https://github.com/HarbourMasters/Shipwright", title: "Ocarina of Time", console: "Nintendo 64" }, target: "windows", executable: "soh.exe", now: "2026-09-29T00:00:00.000Z" });
  assert.equal(m.repo, "HarbourMasters/Shipwright"); assert.equal(m.status, "ready"); assert.equal(m.release.tag, null); assert.equal(m.adopted, "2026-09-29T00:00:00.000Z");
  assert.equal(m.plan.build.executable, "soh.exe"); assert.deepEqual(m.plan.game_files, []);
  assert.deepEqual(checkFolder(d, m), { missing: [], placed: [], needed: [] });
});

test("checkFolder finds missing release files and moved game files", () => {
  const d = tmp(); fs.writeFileSync(path.join(d, "a.exe"), "x"); fs.mkdirSync(path.join(d, "Game Files")); fs.writeFileSync(path.join(d, "Game Files", "rom.z64"), "1234");
  const m = { release: { files: ["a.exe", "b.dll"] }, plan: { game_files: [{ label: "ROM", placed: { name: "rom.z64", bytes: 4 } }, { label: "BIOS", placed: { name: "bios.bin", bytes: 9 } }, { label: "Disc 2" }] } };
  const r = checkFolder(d, m);
  assert.deepEqual(r.missing, ["b.dll"]);
  assert.deepEqual(r.placed.map((p) => [p.label, p.exists, p.sizeOk]), [["ROM", true, true], ["BIOS", false, false]]);
  assert.deepEqual(r.needed, ["Disc 2"]);
});
