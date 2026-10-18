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
  assert.equal(matchAsset("SoH-Ackbar-Delta-Win64.zip", "9.2.0", A("SoH-Blair-Alfa-Win64.zip", "SoH-Blair-Alfa-Linux.zip", "SoH-Blair-Alfa-Mac.zip")).name, "SoH-Blair-Alfa-Win64.zip");
});

test("nextStep holds a new release 48 hours, then checks who uploaded it", () => {
  const now = Date.parse("2026-10-18T12:00:00Z"), build = { release_tag: "v1.0", release_asset: "G-v1.0-win.zip" };
  const rel = (tag, at, uploader = "owner") => ({ tag, publishedAt: at, assets: [{ name: `G-${tag}-win.zip`, uploader }] });
  assert.equal(nextStep(build, [rel("v1.0", "2026-01-01T00:00:00Z")], { owner: "owner", now }).action, "current");
  const young = nextStep(build, [rel("v1.1", "2026-10-17T12:00:00Z"), rel("v1.0", "2026-01-01T00:00:00Z")], { owner: "owner", now });
  assert.equal(young.action, "wait"); assert.match(young.why, /24 hours old/);
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
