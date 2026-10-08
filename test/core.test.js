import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { parseRepoUrl } from "../src/github.js";
import { sweepMacJunk } from "../src/junk.js";
import { extractZip, gameFolderName, setupGame, placeFile, cueCompanions } from "../src/setup.js";
import { readManifests, renderInstallHtml } from "../src/installhtml.js";
import { Plan } from "../src/plan.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "buddy-"));

test("parses repo links in the shapes people paste", () => {
  assert.deepEqual(parseRepoUrl("https://github.com/mchughalex/skate3recomp"), { host: "github", owner: "mchughalex", repo: "skate3recomp" });
  assert.deepEqual(parseRepoUrl("https://github.com/new-coke/strikers.git/"), { host: "github", owner: "new-coke", repo: "strikers" });
  assert.deepEqual(parseRepoUrl("akratch/goldenballoon"), { host: "github", owner: "akratch", repo: "goldenballoon" });
  assert.deepEqual(parseRepoUrl("https://gitlab.com/sonicdcer/MarioKart64Recomp"), { host: "gitlab", owner: "sonicdcer", repo: "MarioKart64Recomp" });
  assert.throws(() => parseRepoUrl("https://bitbucket.org/x/y"));
});

test("sweeps Mac junk and nothing else", () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, "Game - Wii", "__MACOSX", "deep"), { recursive: true });
  fs.writeFileSync(path.join(root, "Game - Wii", ".DS_Store"), "");
  fs.writeFileSync(path.join(root, "Game - Wii", "._game.exe"), "");
  fs.writeFileSync(path.join(root, "Game - Wii", "game.exe"), "real");
  fs.writeFileSync(path.join(root, ".DS_Store"), "");
  const removed = sweepMacJunk(root);
  assert.equal(removed.length, 4);
  assert.deepEqual(fs.readdirSync(path.join(root, "Game - Wii")), ["game.exe"]);
});

test("extracts a zip and hoists a single root folder", () => {
  const root = tmp();
  const zip = new AdmZip();
  zip.addFile("Skate3Recomp-Windows/skate3.exe", Buffer.from("exe"));
  zip.addFile("Skate3Recomp-Windows/data/x.bin", Buffer.from("bin"));
  zip.addFile("__MACOSX/._skate3.exe", Buffer.from("junk"));
  const zipPath = path.join(root, "a.zip");
  zip.writeZip(zipPath);
  extractZip(zipPath, path.join(root, "out"));
  assert.ok(fs.existsSync(path.join(root, "out", "skate3.exe")));
  assert.ok(fs.existsSync(path.join(root, "out", "data", "x.bin")));
  assert.ok(!fs.existsSync(path.join(root, "out", "__MACOSX")));
});

test("rejects zip entries that escape the target folder", () => {
  const root = tmp();
  const zip = new AdmZip();
  zip.addFile("../../evil.txt", Buffer.from("x"));
  const zipPath = path.join(root, "evil.zip");
  zip.writeZip(zipPath);
  extractZip(zipPath, path.join(root, "out"));
  assert.ok(!fs.existsSync(path.join(root, "evil.txt")), "file escaped the target folder");
  assert.ok(!fs.existsSync(path.join(path.dirname(root), "evil.txt")), "file escaped the temp dir");
});

const fakePlan = {
  game_title: "Skate 3", console: "Xbox 360",
  build: { method: "release", release_asset: "Skate3Recomp-Windows.zip", release_tag: null, build_steps: [], required_tools: [], executable: "skate3.exe" },
  game_files: [{ label: "Skate 3 disc image", description: "ISO from your own Xbox 360 copy", accepted_formats: [".iso"], expected_filename: null, how_provided: "in_app_picker", drop_into: "Game Files", notes: null, kind: "game", expected_region: "unknown", required_version: null, expected_hashes: [], expected_size: null, expected_serial: null }],
  first_run: ["Run skate3.exe", "Click Select ISO"], notes: ["Needs Title Update 3"], confidence: "high", unsure: [], artwork_url: null, mods_method: "none", mods_folder: null, mods_formats: [], mods_notes: "",
};

test("plan schema accepts the shape we execute", () => {
  assert.ok(Plan.safeParse(fakePlan).success);
  assert.equal(gameFolderName(fakePlan), "Skate 3 - Xbox 360");
  assert.equal(gameFolderName({ game_title: "Mario: Kart?", console: "N64/" }), "Mario Kart - N64");
});

test("setup lays out the folder and install.html lists it", async () => {
  const out = tmp();
  const ctx = { fullName: "x/y", url: "https://github.com/x/y", homepage: "", zipballUrl: "", releases: [{ tag: "v1", url: "u", assets: [] }] };
  // asset missing from the release -> needs_attention, still writes drop folders + manifest
  const m = await setupGame({ plan: fakePlan, ctx, outDir: out });
  assert.equal(m.status, "needs_attention");
  assert.ok(fs.existsSync(path.join(out, "Skate 3 - Xbox 360", "Game Files", "PUT GAME FILE HERE.txt")));
  const html = renderInstallHtml(readManifests(out), out);
  assert.match(html, /Skate 3 - Xbox 360\\Game Files/);
  assert.match(html, /Needs Attention/);
  assert.match(html, /Needs Title Update 3/);
  assert.doesNotMatch(html, /<script/);
});

test("picked files are moved or copied into place and install.html says In Place", async () => {
  const out = tmp();
  const src = tmp();
  const iso = path.join(src, "my dump.iso");
  fs.writeFileSync(iso, "iso-bytes");
  const ctx = { fullName: "x/y", url: "https://github.com/x/y", homepage: "", zipballUrl: "", releases: [{ tag: "v1", url: "u", assets: [] }] };
  const plan = structuredClone(fakePlan);
  plan.game_files[0].expected_filename = "skate3.iso";

  const m = await setupGame({ plan, ctx, outDir: out, picks: { 0: iso }, mode: "move" });
  const dest = path.join(out, "Skate 3 - Xbox 360", "Game Files", "skate3.iso");
  assert.equal(fs.readFileSync(dest, "utf8"), "iso-bytes");
  assert.ok(!fs.existsSync(iso), "move should remove the source");
  assert.ok(!fs.existsSync(path.join(path.dirname(dest), "PUT GAME FILE HERE.txt")));
  assert.deepEqual(m.plan.game_files[0].placed, { name: "skate3.iso", bytes: 9 });
  const html = renderInstallHtml(readManifests(out), out);
  assert.match(html, /In Place/);
  assert.match(html, /checked disabled/);

  // copy mode keeps the source; pick inside outDir is refused
  fs.writeFileSync(iso, "again");
  const plan2 = structuredClone(fakePlan); plan2.game_title = "Skate 2";
  await setupGame({ plan: plan2, ctx, outDir: out, picks: { 0: iso }, mode: "copy" });
  assert.ok(fs.existsSync(iso));
  assert.ok(fs.existsSync(path.join(out, "Skate 2 - Xbox 360", "Game Files", "my dump.iso")));
  await assert.rejects(setupGame({ plan: structuredClone(fakePlan), ctx, outDir: out, picks: { 0: dest }, mode: "move" }), /outside the output folder/);
});

test("release asset is found across releases, by tag when given", async () => {
  const out = tmp();
  const ctx = { fullName: "x/y", url: "https://github.com/x/y", homepage: "", zipballUrl: "", releases: [
    { tag: "sm2-v1.0", url: "u2", assets: [{ name: "Spider-Man-2.zip", size: 1, url: "http://127.0.0.1:9/x" }] },
    { tag: "sm1-v1.0", url: "u1", assets: [{ name: "Spider-Man-1.zip", size: 1, url: "http://127.0.0.1:9/x" }] },
  ] };
  const plan = structuredClone(fakePlan);
  plan.game_title = "Spider-Man"; plan.build.release_asset = "Spider-Man-1.zip"; plan.build.release_tag = "sm1-v1.0";
  // download fails (nothing listens on port 9); the log proves the right asset was chosen first
  const lines = [];
  await assert.rejects(setupGame({ plan, ctx, outDir: out, log: (m) => lines.push(m) }), /Download failed|fetch failed/);
  assert.ok(lines.includes("Downloading Spider-Man-1.zip…"), lines.join("\n"));
  plan.build.release_asset = "nope.zip";
  const m = await setupGame({ plan, ctx, outDir: out });
  assert.equal(m.status, "needs_attention");
  assert.equal(m.release, null);
});

test("picking a .cue brings its BIN tracks along", () => {
  const src = tmp(), dest = tmp();
  fs.writeFileSync(path.join(src, "Game.cue"), 'FILE "Game (Track 1).bin" BINARY\n  TRACK 01 MODE2/2352\nFILE "Game (Track 2).bin" BINARY\n');
  fs.writeFileSync(path.join(src, "Game (Track 1).bin"), "aaaa");
  fs.writeFileSync(path.join(src, "Game (Track 2).bin"), "bb");
  assert.equal(cueCompanions(path.join(src, "Game.cue")).length, 2);
  const placed = placeFile(path.join(src, "Game.cue"), dest, { mode: "move" });
  assert.deepEqual(fs.readdirSync(dest).sort(), ["Game (Track 1).bin", "Game (Track 2).bin", "Game.cue"]);
  assert.deepEqual(fs.readdirSync(src), []);
  assert.deepEqual(placed.companions, ["Game (Track 1).bin", "Game (Track 2).bin"]);
});

test("folder artwork: ico + desktop.ini written, Mac icon set, sweep keeps it until Clean", async () => {
  const { applyFolderArtwork, pngToIco } = await import("../src/icons.js");
  const dir = tmp();
  // 2x2 red PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVQI12P4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
  const src = path.join(tmp(), "art.png"); fs.writeFileSync(src, png);
  await applyFolderArtwork(dir, src);
  assert.ok(fs.existsSync(path.join(dir, "desktop.ini")));
  assert.equal(fs.readFileSync(path.join(dir, "folder.ico")).readUInt16LE(2), 1);
  if (process.platform === "darwin") {
    assert.ok(fs.existsSync(path.join(dir, "Icon\r")), "Finder icon file");
    assert.equal(sweepMacJunk(dir, { keepIcons: true }).length, 0);
    assert.equal(sweepMacJunk(dir).length, 1);
  }
  assert.equal(pngToIco(Buffer.alloc(3), { width: 256, height: 256 })[6], 0);
});

test("updating into an existing folder keeps placed files and records previousTag", async () => {
  const out = tmp(), src = tmp();
  const iso = path.join(src, "dump.iso"); fs.writeFileSync(iso, "iso");
  const ctx = { fullName: "x/y", url: "https://github.com/x/y", homepage: "", zipballUrl: "", releases: [{ tag: "v1", url: "u", assets: [] }] };
  const first = structuredClone(fakePlan); // asset isn't in the release -> needs_attention, no download, files still laid out
  await setupGame({ plan: first, ctx, outDir: out, picks: { 0: iso }, verifications: { 0: { status: "match", summary: "Verified: region" } }, mode: "copy" });
  // fake that the first run had a release tag and was installable
  const mf = path.join(out, "Skate 3 - Xbox 360", "decomp-buddy.json");
  const m1 = JSON.parse(fs.readFileSync(mf, "utf8")); m1.release = { tag: "v1", url: "u" }; m1.status = "ready";
  Object.assign(m1, { lastPlayed: "2026-09-20T00:00:00Z", steamAppId: 123, launchArgs: "--fullscreen" }); // the player's, must survive
  fs.writeFileSync(mf, JSON.stringify(m1));
  const lines = [];
  const second = structuredClone(fakePlan);
  const m2 = await setupGame({ plan: second, ctx: { ...ctx, releases: [{ tag: "v2", url: "u2", assets: [] }] }, outDir: out, log: (l) => lines.push(l) });
  assert.ok(lines.some((l) => l.startsWith("Kept dump.iso")), lines.join("\n"));
  assert.deepEqual(m2.plan.game_files[0].placed, { name: "dump.iso", bytes: 3 });
  assert.equal(m2.plan.game_files[0].verification.status, "match");
  assert.ok(!fs.existsSync(path.join(out, "Skate 3 - Xbox 360", "Game Files", "PUT GAME FILE HERE.txt")));
  assert.equal(m2.previousTag, "v1");
  assert.deepEqual([m2.lastPlayed, m2.steamAppId, m2.launchArgs], ["2026-09-20T00:00:00Z", 123, "--fullscreen"]);
});

test("install.html survives manifests written by older versions (windows -> build rename)", () => {
  const out = tmp();
  fs.mkdirSync(path.join(out, "Old Game - SNES"));
  fs.writeFileSync(path.join(out, "Old Game - SNES", "decomp-buddy.json"), JSON.stringify({ setUpAt: "2026-09-13T00:00:00Z", repo: "x/y", repoUrl: "u", folder: "Old Game - SNES", status: "ready", release: null, plan: { game_title: "Old Game", console: "SNES", windows: { method: "release", release_asset: "a.zip", build_steps: [], required_tools: [], executable: null }, game_files: [], first_run: [], notes: [], confidence: "high", unsure: [] } }));
  fs.mkdirSync(path.join(out, "Broken"));
  fs.writeFileSync(path.join(out, "Broken", "decomp-buddy.json"), "{not json");
  const html = renderInstallHtml(readManifests(out), out);
  assert.match(html, /Old Game/);
});

test("extracts .tar.zst (zstd via Node, tar via 7-Zip) and keeps exec bits", async () => {
  const zlib = await import("node:zlib");
  const { execFileSync } = await import("node:child_process");
  const { path7za } = await import("7zip-bin");
  const d = tmp(); const src = path.join(d, "launcher"); fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, "run.sh"), "#!/bin/sh\necho hi\n", { mode: 0o755 });
  fs.writeFileSync(path.join(src, "data.bin"), "x");
  execFileSync(path7za, ["a", "-bd", "-ttar", path.join(d, "l.tar"), src], { stdio: "ignore" });
  fs.writeFileSync(path.join(d, "l.tar.zst"), zlib.zstdCompressSync(fs.readFileSync(path.join(d, "l.tar"))));
  const n = extractZip(path.join(d, "l.tar.zst"), path.join(d, "out"));
  assert.ok(n >= 1);
  assert.ok(fs.existsSync(path.join(d, "out", "run.sh")), fs.readdirSync(path.join(d, "out")).join(","));
  assert.ok(fs.statSync(path.join(d, "out", "run.sh")).mode & 0o100, "exec bit kept");
});

test("an asset from the wrong platform is refused, not installed", async () => {
  const { assetMismatch } = await import("../src/targets.js");
  assert.equal(assetMismatch("geometrywars3-launcher-linux-x86_64.tar.zst", "windows"), "a Mac/Linux build");
  assert.equal(assetMismatch("game-macos-x64.zip", "macos-arm64"), "an Intel Mac build");
  assert.equal(assetMismatch("Skate3Recomp-Windows.zip", "windows"), null);
  assert.equal(assetMismatch("strikers-windows-x86_64.zip", "linux"), "a Windows/Mac build");
  assert.equal(assetMismatch("Golden-Balloon-1.7.0-windows-x64.zip", "windows"), null);
  const out = tmp();
  const ctx = { fullName: "x/y", url: "u", homepage: "", zipballUrl: "", releases: [{ tag: "v1", url: "u", assets: [{ name: "game-linux-x86_64.tar.zst", size: 1, url: "http://127.0.0.1:9/x" }] }] };
  const plan = structuredClone(fakePlan); plan.build.release_asset = "game-linux-x86_64.tar.zst";
  const m = await setupGame({ plan, ctx, outDir: out, target: "windows" });
  assert.equal(m.status, "unsupported"); assert.match(m.statusDetail, /Mac\/Linux build/);
});

test("download verifies GitHub's digest and refuses a bad one; disk check refuses when short", async () => {
  const { download, freeBytes } = await import("../src/setup.js");
  const d = tmp();
  const body = Buffer.from("release bytes");
  const sha = (await import("node:crypto")).createHash("sha256").update(body).digest("hex");
  const fetchImpl = async () => new Response(body, { status: 200, headers: { "content-length": String(body.length) } });
  const ok = await download("http://x/a.zip", path.join(d, "a.zip"), () => {}, { digest: `sha256:${sha}`, fetchImpl });
  assert.equal(ok.verified, true);
  await assert.rejects(download("http://x/b.zip", path.join(d, "b.zip"), () => {}, { digest: "sha256:" + "0".repeat(64), fetchImpl }), /didn't match/);
  assert.ok(!fs.existsSync(path.join(d, "b.zip")), "bad download deleted");
  assert.equal((await download("http://x/c.zip", path.join(d, "c.zip"), () => {}, { fetchImpl })).verified, null);
  assert.equal(freeBytes(d, () => ({ bavail: 10n, bsize: 4096n })), 40960);
  const ctx = { fullName: "x/y", url: "u", homepage: "", zipballUrl: "", releases: [{ tag: "v1", url: "u", assets: [{ name: "big.zip", size: 5_000_000_000, url: "http://127.0.0.1:9/x" }] }] };
  const plan = structuredClone(fakePlan); plan.build.release_asset = "big.zip";
  await assert.rejects(setupGame({ plan, ctx, outDir: d, statfs: () => ({ bavail: 100n, bsize: 4096n }) }), /Not enough space/);
});
