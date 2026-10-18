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
