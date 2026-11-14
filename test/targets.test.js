import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TARGETS, PLATFORM_OF_TARGET, hostTarget, targetIsHost, assetMismatch, armSibling } from "../src/targets.js";
import { lookupPlan } from "../src/plans.js";

test("host target picks the CPU too", () => {
  assert.equal(hostTarget("win32", "x64"), "windows"); assert.equal(hostTarget("win32", "arm64"), "windows-arm64");
  assert.equal(hostTarget("linux", "arm64"), "linux-arm64"); assert.equal(hostTarget("darwin", "arm64"), "macos-arm64");
});

test("what runs where: x64 Windows runs on ARM Windows, x64 Linux doesn't run on ARM Linux", () => {
  assert.equal(targetIsHost("windows", "win32", "arm64"), true);
  assert.equal(targetIsHost("macos-x64", "darwin", "arm64"), true);
  assert.equal(targetIsHost("linux", "linux", "arm64"), false);
  assert.equal(targetIsHost("linux-arm64", "linux", "arm64"), true);
  assert.equal(targetIsHost("linux-arm64", "linux", "x64"), false);
  assert.equal(targetIsHost("windows", "linux", "x64"), false);
});

test("ARM asset guards and the aarch64 sibling", () => {
  assert.equal(assetMismatch("game-linux-x86_64.AppImage", "linux-arm64"), "an x64 Linux build");
  assert.equal(assetMismatch("game-linux-aarch64.AppImage", "linux-arm64"), null);
  assert.equal(assetMismatch("game-linux-arm64.tar.gz", "linux"), "an ARM build");
  assert.equal(assetMismatch("game-windows-x64.zip", "windows-arm64"), null); // x64 runs on Windows on ARM
  const assets = [{ name: "game-linux-x86_64.AppImage" }, { name: "game-linux-aarch64.AppImage" }];
  assert.equal(armSibling(assets, "game-linux-x86_64.AppImage").name, "game-linux-aarch64.AppImage");
  assert.equal(armSibling([{ name: "game.zip" }], "game.zip"), null);
});

test("ARM targets fall back to the x64 published plan", () => {
  const pub = { plans: { k: { tag: "v1", targets: { windows: { games: [1] }, linux: { games: [2] } } } } };
  assert.deepEqual(lookupPlan(pub, "k", "windows-arm64").analysis.games, [1]);
  assert.deepEqual(lookupPlan(pub, "k", "linux-arm64").analysis.games, [2]);
});

test("the renderer's copies of the target tables match src/targets.js", () => {
  const app = fs.readFileSync(new URL("../renderer/app.js", import.meta.url), "utf8");
  const obj = (name) => JSON.parse(app.match(new RegExp(`const ${name} = (\\{[^}]+\\})`))[1].replace(/([{,]\s*)([a-z][\w-]*)(\s*:)/g, '$1"$2"$3'));
  assert.deepEqual(obj("PLATFORM_OF_TARGET"), PLATFORM_OF_TARGET);
  assert.deepEqual(Object.keys(obj("TARGET_LABEL")).sort(), Object.keys(TARGETS).sort());
  assert.deepEqual(obj("TARGET_LABEL"), Object.fromEntries(Object.entries(TARGETS).map(([k, t]) => [k, t.label])));
});

test("consoles: a console-only file type settles it, a name is only a hint, and computer downloads aren't refused for naming one", async () => {
  const { consoleOfAsset, consoleNamedIn, assetMismatch, targetIsHost, isConsoleTarget } = await import("../src/targets.js");
  assert.equal(consoleOfAsset("UnleashedRecomp.nro"), "switch");
  assert.equal(consoleOfAsset("zelda3-3ds-v4.1.cia"), "3ds");
  assert.equal(consoleOfAsset("Spider-Man.3.Xbox.360.Recomp.v0.2.1.zip"), null);
  assert.equal(consoleNamedIn("Spider-Man.3.Xbox.360.Recomp.v0.2.1.zip"), "xbox360");
  assert.equal(assetMismatch("Spider-Man.3.Xbox.360.Recomp.v0.2.1.zip", "windows"), null, "a PC recomp naming the original console is still a Windows download");
  assert.equal(assetMismatch("GoW_PSP_Launcher-v1.5.0.zip", "windows"), null);
  assert.equal(assetMismatch("UnleashedRecomp.nro", "windows"), "a Nintendo Switch build");
  assert.equal(assetMismatch("Balatro360-Xbox360-1.0.2.0.zip", "xbox360"), null);
  assert.equal(assetMismatch("XboxSX-SegaRally1.0.0c.zip", "xbox360"), "an Xbox Series X|S build");
  assert.equal(assetMismatch("game-setup.exe", "xbox360"), "a computer or phone build");
  assert.equal(isConsoleTarget("xbox360"), true); assert.equal(targetIsHost("xbox360"), false);
});
