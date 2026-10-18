import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { parseDevices, classifyProps, safeRemote, parsePlatformTools, findAdb, adbRunner, listDevices, classify, installApk, listPackages, pushFiles, launch, uninstall } from "../src/adb.js";
import { assetMismatch, targetIsHost, PLATFORM_OF_TARGET } from "../src/targets.js";
import { Plan, PLAN_JSON_SCHEMA } from "../src/plan.js";
import { setupGame } from "../src/setup.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(here, "fixtures", "fake-adb.mjs");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "buddy-adb-"));

test("adb devices -l: ready, waiting for Allow, offline and Linux's no permissions", () => {
  const out = `* daemon not running; starting now at tcp:5037
* daemon started successfully
List of devices attached
2G0YC1ZF8B0J4K         device usb:1-1 product:eureka model:Quest_3 device:eureka transport_id:3
R58M123ABC             unauthorized usb:1-2 transport_id:4
emulator-5554          offline transport_id:5
0123456789ABCDEF       no permissions (missing udev rules? user is in the plugdev group); see [http://developer.android.com/tools/device.html] usb:1-3 transport_id:6

`;
  assert.deepEqual(parseDevices(out), [
    { serial: "2G0YC1ZF8B0J4K", state: "device", model: "Quest 3", product: "eureka" },
    { serial: "R58M123ABC", state: "unauthorized", model: null, product: null },
    { serial: "emulator-5554", state: "offline", model: null, product: null },
    { serial: "0123456789ABCDEF", state: "no permissions", model: null, product: null },
  ]);
  assert.deepEqual(parseDevices("List of devices attached\n\n"), []);
});

test("getprop decides Quest or phone", () => {
  assert.equal(classifyProps("Oculus\nQuest 3\narm64-v8a\n").kind, "quest");
  assert.equal(classifyProps("Meta\nQuest 3S\narm64-v8a\n").kind, "quest");
  assert.equal(classifyProps("unknown\nQuest Pro\narm64-v8a").kind, "quest");
  const phone = classifyProps("samsung\nSM-S921U\narm64-v8a,armeabi-v7a,armeabi\n");
  assert.equal(phone.kind, "android"); assert.deepEqual(phone.abis, ["arm64-v8a", "armeabi-v7a", "armeabi"]); assert.equal(phone.model, "SM-S921U");
  assert.equal(classifyProps("Metalware\nM1\nx86_64").kind, "android"); // "meta" only as its own word
});

test("safeRemote keeps every copy inside /sdcard", () => {
  assert.equal(safeRemote("QuestZDoom/wads", "doom.wad"), "/sdcard/QuestZDoom/wads/doom.wad");
  assert.equal(safeRemote("/sdcard/QuestZDoom/wads/", "doom.wad"), "/sdcard/QuestZDoom/wads/doom.wad");
  assert.equal(safeRemote("", "x.bin"), "/sdcard/x.bin");
  for (const bad of ["/data/local/tmp", "../etc", "a/../../b", "QuestZDoom\\wads", "C:/x"]) assert.throws(() => safeRemote(bad, "f"), /isn't a folder/, bad);
  assert.throws(() => safeRemote("ok", "..\\evil"), /isn't a folder/);
});

test("Google's repository index: newest stable Platform-Tools for this OS, with its SHA-1", () => {
  const xml = fs.readFileSync(path.join(here, "fixtures", "repository2-3-sample.xml"), "utf8");
  assert.deepEqual(parsePlatformTools(xml, "darwin"), { version: "37.0.1", url: "https://dl.google.com/android/repository/platform-tools_r37.0.1-darwin.zip", sha1: "6ae73f4de6452dc57e62ec02b68eed92a4c21661", size: 16110554 });
  assert.equal(parsePlatformTools(xml, "win32").url, "https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip");
  assert.equal(parsePlatformTools(xml, "linux").sha1, "477254aa5f903c15cf51001717bdf347fb6b53e0");
  assert.throws(() => parsePlatformTools("<sdk/>", "darwin"), /no Platform-Tools/);
});

test("device targets take .apk files only; a phone refuses VR builds, a Quest takes any .apk", () => {
  assert.equal(assetMismatch("QuestZDoom-1.2.apk", "quest"), null);
  assert.equal(assetMismatch("game-android-arm64.apk", "quest"), null);
  assert.match(assetMismatch("game-windows-x64.zip", "quest"), /computer build/);
  assert.equal(assetMismatch("game-android-arm64.apk", "android"), null);
  for (const vr of ["QuestZDoom.apk", "game-oculus.apk", "game_vr.apk", "Game-OpenXR.apk", "game-xr-release.apk"]) assert.equal(assetMismatch(vr, "android"), "a VR headset build", vr);
  assert.equal(assetMismatch("vrally.apk", "android"), null); // "vr" inside a word isn't a VR build
  assert.equal(assetMismatch("game.apk", "windows"), "an Android app");
  assert.equal(targetIsHost("android", "darwin", "arm64"), false); assert.equal(targetIsHost("quest", "linux", "arm64"), false);
  assert.equal(PLATFORM_OF_TARGET.quest, "Meta Quest"); assert.equal(PLATFORM_OF_TARGET.android, "Android");
});

test("plans from before devices still parse, and the JSON schema has no defaults", () => {
  const old = { game_title: "G", console: "C", build: { method: "release", release_asset: "g.apk", release_tag: "v1", build_steps: [], required_tools: [], executable: null },
    game_files: [{ label: "WAD", description: "d", accepted_formats: [".wad"], expected_filename: null, how_provided: "folder", drop_into: "Game Files", notes: null, kind: "game", expected_region: "any", required_version: null, expected_hashes: [], expected_size: null, expected_serial: null }],
    first_run: [], notes: [], confidence: "high", unsure: [], artwork_url: null, mods_method: "none", mods_folder: null, mods_formats: [], mods_notes: "" };
  const p = Plan.parse(old);
  assert.equal(p.build.package_id, null); assert.equal(p.game_files[0].push_to, null);
  assert.ok(!JSON.stringify(PLAN_JSON_SCHEMA).includes('"default"'));
  assert.ok(JSON.stringify(PLAN_JSON_SCHEMA).includes("push_to"));
});

test("findAdb: DECOMP_ADB, then PATH, then Decomp Buddy's own copy", () => {
  const d = tmp(); fs.mkdirSync(path.join(d, "bin")); fs.mkdirSync(path.join(d, "tools", "platform-tools"), { recursive: true });
  assert.equal(findAdb({ env: { DECOMP_ADB: "/x/adb" }, toolsDir: d }), "/x/adb");
  assert.equal(findAdb({ env: { PATH: path.join(d, "bin") }, toolsDir: path.join(d, "tools"), platform: "darwin" }), null);
  fs.writeFileSync(path.join(d, "tools", "platform-tools", "adb"), "");
  assert.equal(findAdb({ env: { PATH: path.join(d, "bin") }, toolsDir: path.join(d, "tools"), platform: "darwin" }), path.join(d, "tools", "platform-tools", "adb"));
  fs.writeFileSync(path.join(d, "bin", "adb"), "");
  assert.equal(findAdb({ env: { PATH: path.join(d, "bin") }, toolsDir: path.join(d, "tools"), platform: "darwin" }), path.join(d, "bin", "adb"));
});

test("the fake adb end to end: list, classify, install, push one file at a time, launch, uninstall -k", async () => {
  const d = tmp(), logFile = path.join(d, "adb.log");
  process.env.FAKE_ADB_LOG = logFile;
  try {
    const run = adbRunner(FAKE);
    const [q] = await listDevices(run);
    assert.equal(q.model, "Quest 3");
    assert.equal((await classify(run, q.serial)).kind, "quest");
    fs.writeFileSync(path.join(d, "g.apk"), "apk"); fs.writeFileSync(path.join(d, "doom.wad"), "wad"); fs.writeFileSync(path.join(d, "doom2.wad"), "wad2");
    assert.deepEqual(await listPackages(run, q.serial), ["com.oculus.browser"]);
    await installApk(run, q.serial, path.join(d, "g.apk"));
    assert.ok((await listPackages(run, q.serial)).includes("com.drbeef.questzdoom"));
    const lines = [];
    await pushFiles(run, q.serial, [{ from: path.join(d, "doom.wad"), to: safeRemote("QuestZDoom/wads", "doom.wad") }, { from: path.join(d, "doom2.wad"), to: safeRemote("QuestZDoom/wads", "doom2.wad") }], { log: (m) => lines.push(m) });
    assert.match(lines[0], /file 1 of 2/); assert.match(lines[1], /file 2 of 2/);
    await launch(run, q.serial, "com.drbeef.questzdoom");
    await assert.rejects(launch(run, q.serial, "x; reboot"), /isn't an Android package/);
    await uninstall(run, q.serial, "com.drbeef.questzdoom");
    await assert.rejects(installApk(run, q.serial, path.join(d, "missing.apk")), /failed to stat/);
    const calls = fs.readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.ok(calls.some((a) => a.join(" ") === `-s ${q.serial} install -r --streaming ${path.join(d, "g.apk")}`));
    assert.ok(calls.some((a) => a.join(" ") === `-s ${q.serial} push ${path.join(d, "doom.wad")} /sdcard/QuestZDoom/wads/doom.wad`));
    assert.ok(calls.some((a) => a.join(" ") === `-s ${q.serial} shell monkey -p com.drbeef.questzdoom -c android.intent.category.LAUNCHER 1`));
    assert.ok(calls.some((a) => a.join(" ") === `-s ${q.serial} uninstall -k com.drbeef.questzdoom`));
  } finally { delete process.env.FAKE_ADB_LOG; }
});

test("setting a game up for a Quest stages its .apk and game files in the Library folder", async () => {
  const server = http.createServer((_q, r) => { r.writeHead(200, { "content-length": 3 }); r.end("apk"); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const out = tmp(), src = tmp(); fs.writeFileSync(path.join(src, "doom.wad"), "wad");
    const url = `http://127.0.0.1:${server.address().port}/QuestZDoom.apk`;
    const ctx = { fullName: "DrBeef/QuestZDoom", url: "u", homepage: "", zipballUrl: "", releases: [{ tag: "v1", url: "u", assets: [{ name: "QuestZDoom.apk", size: 3, url }, { name: "QuestZDoom-win.zip", size: 3, url }] }] };
    const plan = Plan.parse({ game_title: "Doom", console: "PC", build: { method: "release", release_asset: "QuestZDoom.apk", release_tag: "v1", build_steps: [], required_tools: [], executable: null, package_id: "com.drbeef.questzdoom" },
      game_files: [{ label: "WAD", description: "d", accepted_formats: [".wad"], expected_filename: null, how_provided: "folder", drop_into: "Game Files", notes: null, kind: "game", expected_region: "any", required_version: null, expected_hashes: [], expected_size: null, expected_serial: null, push_to: "QuestZDoom/wads" }],
      first_run: [], notes: [], confidence: "high", unsure: [], artwork_url: null, mods_method: "none", mods_folder: null, mods_formats: [], mods_notes: "" });
    const m = await setupGame({ plan, ctx, outDir: out, target: "quest", picks: { 0: path.join(src, "doom.wad") }, mode: "copy" });
    assert.equal(m.status, "staged"); assert.equal(m.apk, "QuestZDoom.apk"); assert.equal(m.package_id, "com.drbeef.questzdoom");
    assert.equal(fs.readFileSync(path.join(out, "Doom - PC", "QuestZDoom.apk"), "utf8"), "apk");
    assert.ok(fs.existsSync(path.join(out, "Doom - PC", "Game Files", "doom.wad")));
    // A computer build named as the Quest download is refused.
    const wrong = structuredClone(plan); wrong.build.release_asset = "QuestZDoom-win.zip"; wrong.game_title = "Wrong";
    assert.equal((await setupGame({ plan: wrong, ctx, outDir: out, target: "quest" })).status, "unsupported");
  } finally { server.close(); }
});
