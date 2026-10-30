import { test } from "node:test";
import assert from "node:assert/strict";
import { pipelineStatus } from "../src/pipeline.js";

test("pipelineStatus: where each game is, and the counts the admin page shows", () => {
  const build = (extra = {}) => ({ games: [{ game_title: "G", build: { method: "release", release_tag: "v1", release_asset: "g.zip", ...extra } }] });
  const plans = { plans: {
    "github:a/live": { targets: { windows: build({ scanned: { sha256: "x" } }) } },
    "github:a/unscanned": { targets: { windows: build() } },
    "github:a/update": { targets: { windows: build({ scanned: { sha256: "x" }, next: { release_tag: "v2", release_asset: "g.zip" } }) } },
    "github:a/source": { targets: { linux: { games: [{ game_title: "S", build: { method: "source" } }] } } } } };
  const catalog = { games: [
    { repo: "a/live", title: "Live", console: "PC", slug: "live-pc", plan: {}, scan: { at: "t" }, boxartUrl: "c" },
    { repo: "a/unscanned", title: "Unscanned", console: "PC", slug: "u", plan: {}, boxartUrl: "c" },
    { repo: "a/update", title: "Update", console: "PC", slug: "up", plan: {}, scan: { at: "t" } },
    { repo: "a/source", title: "Source", console: "PC", slug: "s", plan: {}, boxartUrl: "c" },
    { repo: "a/noplan", title: "No Plan", console: "PC", slug: "n" }] };
  const waiting = { games: [{ repo: "a/soon", title: "Soon" }], hidden: [{ repo: "a/tool", reason: "A tool, not a game" }, { repo: "a/new", reason: "Held for safety: the GitHub account is under 30 days old" }] };
  const s = pipelineStatus({ catalog, waiting, plans, blocked: [{ repo: "a/bad", title: "Bad" }] });
  const by = Object.fromEntries(s.games.map((g) => [g.repo, g]));
  assert.equal(by["a/live"].stage, "live");
  assert.equal(by["a/unscanned"].stage, "scan");
  assert.equal(by["a/source"].stage, "live");   // nothing to scan is skipped, not waiting
  assert.equal(by["a/source"].steps.find((x) => x.id === "scan").state, "skipped");
  assert.equal(by["a/noplan"].stage, "steps");
  assert.deepEqual(by["a/update"].next, { version: "v2", stage: "scan", note: "Waiting for its scan" });
  assert.equal(by["a/update"].steps.find((x) => x.id === "art").state, "skipped");
  assert.equal(by["a/soon"].outcome, "coming-soon");
  assert.equal(by["a/tool"].outcome, "not-listed");
  assert.equal(by["a/new"].outcome, "held");
  assert.equal(by["a/bad"].outcome, "blocked");
  assert.deepEqual(s.counts, { live: 3, "live-scan": 1, "live-steps": 1, "no-cover": 2, "update-scan": 1, "coming-soon": 1, "not-listed": 1, held: 1, blocked: 1 });
});

test("pipelineStatus: games held back until their steps and scan are done show where they are", () => {
  const s = pipelineStatus({ catalog: { games: [] }, waiting: {}, plans: { plans: {} }, queued: [
    { repo: "a/new", title: "New", console: "PC", slug: "new-pc" }, { repo: "a/scanme", title: "Scan Me", console: "PC", slug: "s", plan: {} }] });
  const by = Object.fromEntries(s.games.map((g) => [g.repo, g]));
  assert.equal(by["a/new"].outcome, "queued"); assert.equal(by["a/new"].stage, "steps");
  assert.equal(by["a/scanme"].stage, "scan");
  assert.deepEqual(by["a/scanme"].steps.map((x) => x.state), ["done", "done", "done", "done", "now", "todo", "todo"]);
  assert.deepEqual(s.counts, { "queued-steps": 1, "queued-scan": 1 });
});
