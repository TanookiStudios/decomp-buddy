import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { extractZip, unpackable, INSTALLER } from "../src/setup.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fmt-"));

test("which release files setup opens itself, and which it leaves for you", () => {
  for (const n of ["Game.AppImage", "game-linux.deb", "Game-1.0.zip", "game.tar.zst", "SoH.dmg", "Game.exe", "portable-win64.exe"]) assert.ok(unpackable(n, "linux"), n);
  for (const n of ["Game-Setup.exe", "GameInstaller.exe", "game.pkg", "game.flatpak"]) { assert.ok(!unpackable(n, "linux"), n); assert.ok(INSTALLER.test(n), n); }
  assert.ok(unpackable("game.run", "linux")); assert.ok(!unpackable("game.run", "win32"));
  assert.ok(unpackable("game.msi", "win32")); assert.ok(!unpackable("game.msi", "darwin"));
});

test("an AppImage lands in the folder and can run", () => {
  const d = tmp(), src = path.join(d, "Game-x86_64.AppImage"); fs.writeFileSync(src, "#!/bin/sh\n");
  extractZip(src, path.join(d, "out"));
  const st = fs.statSync(path.join(d, "out", "Game-x86_64.AppImage")); assert.ok(st.mode & 0o100, "executable bit");
});

// A Debian-style (GNU) ar archive, written by hand so the test doesn't depend on the system's ar.
const arOf = (members) => Buffer.concat([Buffer.from("!<arch>\n"), ...members.flatMap(([name, body]) => {
  const h = `${`${name}/`.padEnd(16)}${"0".padEnd(12)}${"0".padEnd(6)}${"0".padEnd(6)}${"100644".padEnd(8)}${String(body.length).padEnd(10)}\x60\n`;
  return [Buffer.from(h, "latin1"), body, ...(body.length % 2 ? [Buffer.from("\n")] : [])];
})]);
test("a .deb is unpacked from its data.tar, nothing installed", () => {
  const d = tmp(), stage = path.join(d, "stage"); fs.mkdirSync(path.join(stage, "usr/games"), { recursive: true });
  fs.writeFileSync(path.join(stage, "usr/games/mygame"), "#!/bin/sh\n", { mode: 0o755 });
  execFileSync("tar", ["-czf", path.join(d, "data.tar.gz"), "-C", stage, "usr"]);
  fs.writeFileSync(path.join(d, "game.deb"), arOf([["debian-binary", Buffer.from("2.0\n")], ["control.tar.gz", Buffer.from("not used")], ["data.tar.gz", fs.readFileSync(path.join(d, "data.tar.gz"))]]));
  const out = path.join(d, "out"); extractZip(path.join(d, "game.deb"), out);
  const all = execFileSync("find", [out, "-type", "f"], { encoding: "utf8" });
  assert.match(all, /games\/mygame/); assert.doesNotMatch(all, /control\.tar|debian-binary/);
});
