import { test } from "node:test";
import assert from "node:assert/strict";
import { matchAsset, nextStep } from "../src/follow.js";

const A = (...names) => names.map((name) => ({ name, uploader: "dev" }));

test("matchAsset follows the version in a file name, or the same name", () => {
  assert.equal(matchAsset("Game-v0.3.0-win64.zip", "v0.3.0", A("Game-v0.6.2-win64.zip", "Game-v0.6.2-linux.AppImage")).name, "Game-v0.6.2-win64.zip");
  assert.equal(matchAsset("Game-win64.zip", "v1", A("Game-win64.zip", "Game-linux.zip")).name, "Game-win64.zip");
  assert.equal(matchAsset("bh-0.1.0-linux-x64.zip", "v0.1.0", A("bh-0.2.1-windows-x64.zip", "bh-0.2.1-linux-x64.zip")).name, "bh-0.2.1-linux-x64.zip");
  assert.equal(matchAsset("Game-v1-win.zip", "v1", A("Other.zip")), null);
  assert.equal(matchAsset("g-1.0-win.zip", "1.0", A("g-2.0-win.zip", "g-2.0-win.zip.sha256")).name, "g-2.0-win.zip");
  assert.equal(matchAsset("openomf_0.8.7-50-09b5b644_windows.zip", "latest", A("openomf_0.8.7-86-0d355faf_windows.zip", "openomf_0.8.7-86-0d355faf_macos14_arm.zip")).name, "openomf_0.8.7-86-0d355faf_windows.zip");
  assert.equal(matchAsset("vera20k-0.1.0-windows-x64-20261021-075505-2a03746.zip", "v0.1.0", A("vera20k-0.2.1-windows-x64-setup.exe")), null);
  assert.equal(matchAsset("SoH-Ackbar-Delta-Win64.zip", "9.2.0", A("SoH-Blair-Alfa-Win64.zip", "SoH-Blair-Alfa-Linux.zip", "SoH-Blair-Alfa-Mac.zip")).name, "SoH-Blair-Alfa-Win64.zip");
});

test("nextStep moves to a new release at once when its usual uploader made it", () => {
  const now = Date.parse("2026-10-18T12:00:00Z"), build = { release_tag: "v1.0", release_asset: "G-v1.0-win.zip" };
  const rel = (tag, at, uploader = "owner") => ({ tag, publishedAt: at, assets: [{ name: `G-${tag}-win.zip`, uploader }] });
  assert.equal(nextStep(build, [rel("v1.0", "2026-01-01T00:00:00Z")], { owner: "owner", now }).action, "current");
  assert.equal(nextStep(build, [rel("v1.1", "2026-10-18T11:00:00Z"), rel("v1.0", "2026-01-01T00:00:00Z")], { owner: "owner", now }).action, "advance");   // an hour old: no waiting period
  assert.equal(nextStep(build, [rel("v1.1", "2026-10-15T00:00:00Z")], { owner: "Owner", now }).action, "advance");
  assert.equal(nextStep(build, [rel("v1.1", "2026-10-15T00:00:00Z", "github-actions[bot]")], { owner: "owner", now, knownUploaders: ["github-actions[bot]"] }).action, "advance");
  const stranger = nextStep(build, [rel("v1.1", "2026-10-15T00:00:00Z", "someone-new")], { owner: "owner", now, knownUploaders: ["owner"] });
  assert.equal(stranger.action, "wait"); assert.equal(stranger.review, true);
  assert.equal(nextStep(build, [{ tag: "v2", publishedAt: "2026-10-01T00:00:00Z", assets: [{ name: "Totally-Different.7z" }] }], { owner: "owner", now }).action, "replan");
  // A collection (one game per release): a newer release without this game's file is another game.
  const coll = [{ tag: "gamb-v1", publishedAt: "2026-10-10T00:00:00Z", assets: [{ name: "gamb-linux.tar.zst" }] }, { tag: "gama-v1", publishedAt: "2026-09-01T00:00:00Z", assets: [{ name: "gama-linux.tar.zst" }] }];
  assert.equal(nextStep({ release_tag: "gama-v1", release_asset: "gama-linux.tar.zst" }, coll, { owner: "o", now, collection: true }).action, "current");
  assert.equal(nextStep({ release_tag: "gama-v1", release_asset: "gama-linux.tar.zst" }, coll, { owner: "o", now }).action, "replan");
  // Pre-releases never move the published steps.
  assert.equal(nextStep(build, [{ ...rel("v1.2-beta", "2026-10-01T00:00:00Z"), prerelease: true }, rel("v1.0", "2026-01-01T00:00:00Z")], { owner: "owner", now }).action, "current");
});

test("the catalog shows the version Decomp Buddy installs, with the newer one waiting beside it", async () => {
  const { attachFacts, publishedTag } = await import("../src/expand.js");
  const entry = { targets: { windows: { games: [{ build: { method: "release", release_tag: "v0.3.0" } }] }, linux: { games: [{ build: { method: "release", release_tag: "v0.3.0" } }] } } };
  assert.equal(publishedTag(entry), "v0.3.0");
  const [g] = attachFacts([{ owner: "a", repo: "b", version: "v0.6.2" }], { plans: { "github:a/b": entry } });
  assert.equal(g.version, "v0.3.0"); assert.equal(g.latestVersion, "v0.6.2");
  const [h] = attachFacts([{ owner: "a", repo: "c", version: "v1" }], { plans: {} });
  assert.equal(h.version, "v1"); assert.equal(h.latestVersion, undefined);
});

test("updatesFor: real updates only, skipped versions stay quiet, per-game switch beats the default", async () => {
  const { updatesFor } = await import("../src/updates.js");
  const games = [{ owner: "a", repo: "soh", version: "9.3.0", repoUrl: "u1" }, { owner: "c", repo: "coll", version: "x-v2", gameTitle: "X" }, { owner: "c", repo: "coll", version: "y-v1", gameTitle: "Y" }];
  const inst = (repo, tag, extra = {}) => ({ folder: `/g/${repo}`, manifest: { repo, release: { tag }, plan: { game_title: extra.title || repo }, ...extra } });
  const u = updatesFor([inst("a/soh", "9.2.0"), inst("c/coll", "x-v1", { title: "X" }), inst("c/coll", "y-v1", { title: "Y" })], games);
  assert.deepEqual(u.map((x) => [x.title, x.from, x.to, x.auto]), [["a/soh", "9.2.0", "9.3.0", false], ["X", "x-v1", "x-v2", false]]);
  assert.equal(updatesFor([inst("a/soh", "9.2.0", { skipTag: "9.3.0" })], games).length, 0);
  assert.equal(updatesFor([inst("a/soh", "9.2.0", { autoUpdate: false })], games, { autoDefault: true })[0].auto, false);
  assert.equal(updatesFor([inst("a/soh", "9.2.0")], games, { autoDefault: true })[0].auto, true);
});

test("updates: a platform whose plan sits on an older version isn't offered the shown one forever", async () => {
  const { updatesFor } = await import("../src/updates.js");
  const { PLAN_FALLBACK } = await import("../src/targets.js");
  const { attachFacts } = await import("../src/expand.js");
  const fs = await import("node:fs");
  const rel = (tag) => ({ games: [{ game_title: "G", build: { method: "release", release_tag: tag } }] });
  const entry = { targets: { linux: rel("v1.1"), "macos-arm64": rel("v1.1"), windows: rel("v1.0") } };
  const [g] = attachFacts([{ owner: "a", repo: "g", version: "v1.1" }], { plans: { "github:a/g": entry } });
  assert.equal(g.version, "v1.1"); assert.deepEqual(g.targetTags, { linux: "v1.1", "macos-arm64": "v1.1", windows: "v1.0" });
  const inst = (target, tag) => ({ folder: `/g/${target}`, manifest: { repo: "a/g", target, release: { tag }, plan: { game_title: "G" } } });
  // Windows already has what its plan installs; Windows on ARM borrows that plan; Linux really is behind.
  assert.deepEqual(updatesFor([inst("windows", "v1.0"), inst("windows-arm64", "v1.0"), inst("linux", "v1.0")], [g]).map((u) => [u.folder, u.to]), [["/g/linux", "v1.1"]]);
  // All platforms on one version: nothing extra is stored.
  const [h] = attachFacts([{ owner: "a", repo: "h", version: "v2" }], { plans: { "github:a/h": { targets: { windows: rel("v2"), linux: rel("v2") } } } });
  assert.equal(h.targetTags, undefined);
  // The renderer keeps its own copy of the fallback map (it can't import src/).
  const app = fs.readFileSync(new URL("../renderer/app.js", import.meta.url), "utf8");
  assert.deepEqual(JSON.parse(app.match(/const PLAN_FALLBACK = (\{[^}]*\});/)[1]), PLAN_FALLBACK);
});

test("an installer is swapped for the same release's portable download (P.T., 27 Nov 2026)", async () => {
  const { portableTwin } = await import("../src/follow.js");
  const assets = ["P.T.PC.Port-macOS-arm64.dmg", "P.T.PC.Port-macOS-arm64.zip", "P.T.PC.Port-portable-linux.zip", "P.T.PC.Port-portable-windows.zip", "P.T.PC.Port.Setup-linux", "P.T.PC.Port.Setup.exe"].map((name) => ({ name, uploader: "LoreanXavier" }));
  const build = { release_tag: "v1.1.2", release_asset: "P.T.PC.Port.Setup.exe" };
  const step = nextStep(build, [{ tag: "v1.1.2", assets }], { owner: "LoreanXavier", target: "windows" });
  assert.equal(step.action, "advance"); assert.equal(step.asset.name, "P.T.PC.Port-portable-windows.zip");
  assert.equal(nextStep({ ...build, release_asset: "P.T.PC.Port.Setup-linux" }, [{ tag: "v1.1.2", assets }], { owner: "LoreanXavier", target: "linux" }).asset.name, "P.T.PC.Port-portable-linux.zip");
  // Already portable: nothing to do. No target given (older callers): unchanged behavior.
  assert.equal(nextStep({ ...build, release_asset: "P.T.PC.Port-portable-windows.zip" }, [{ tag: "v1.1.2", assets }], { target: "windows" }).action, "current");
  assert.equal(nextStep(build, [{ tag: "v1.1.2", assets }]).action, "current");
  // A newer release: its portable file, not its installer.
  assert.equal(nextStep(build, [{ tag: "v1.2", assets }, { tag: "v1.1.2", assets }], { owner: "LoreanXavier", target: "windows" }).asset.name, "P.T.PC.Port-portable-windows.zip");
  // Tools, servers and zipped installers beside an installer are never the game.
  assert.equal(portableTwin("ttt2_setup.exe", [{ name: "ttt2-server-0.2.0-windows-amd64.zip" }], "windows"), null);
  assert.equal(portableTwin("Game-Setup-v1.exe", [{ name: "Game-Setup-v1-windows.x64.zip" }], "windows"), null);
  assert.equal(portableTwin("Setup.exe", [{ name: "Game-src.zip" }], "windows"), null);
  // Two candidates: only the one that says portable.
  assert.equal(portableTwin("Setup.exe", [{ name: "Game-win64.zip" }, { name: "Game-win64-portable.zip" }], "windows").name, "Game-win64-portable.zip");
});

test("nextStep follows a rolling release that keeps its tag and renames its files", () => {
  const build = { release_tag: "rolling", release_asset: "3SX-17d47de-windows.zip" };
  const rolling = [{ tag: "rolling", prerelease: true, assets: [{ name: "3SX-6187364-windows.zip", uploader: "owner" }, { name: "3SX-6187364-macos.dmg", uploader: "owner" }] }];
  const step = nextStep(build, rolling, { owner: "owner" });
  assert.equal(step.action, "advance"); assert.equal(step.asset.name, "3SX-6187364-windows.zip");
  assert.equal(nextStep(build, [{ tag: "rolling", assets: [{ name: "Unrelated.7z" }] }], { owner: "owner" }).action, "replan");
});
