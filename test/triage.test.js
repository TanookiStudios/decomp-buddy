import { test } from "node:test";
import assert from "node:assert/strict";
import { problems } from "../scripts/triage.mjs";

test("triage answers: play needs a desktop download, every repo answered once, known consoles only", () => {
  const ctx = { "a/port": { platforms: ["Windows"] }, "b/decomp": { platforms: [] }, "c/tool": { platforms: ["Android"] } };
  const ctxOf = (r) => ctx[r.toLowerCase()];
  const ok = { results: [
    { repo: "a/port", verdict: "play", title: "Game", console: "Xbox", reason: "Windows build" },
    { repo: "b/decomp", verdict: "soon", title: "Game 2", console: "Nintendo 64", reason: "ROM decomp" },
    { repo: "c/tool", verdict: "hide", title: "tool", console: "", reason: "Android only" },
  ] };
  assert.deepEqual(problems(ok, ["a/port", "b/decomp", "c/tool"], ctxOf), []);
  const bad = { results: [
    { repo: "b/decomp", verdict: "play", title: "Game 2", console: "N64", reason: "" },
    { repo: "x/stray", verdict: "maybe", title: "", console: "Xbox", reason: "" },
  ] };
  const p = problems(bad, ["a/port", "b/decomp"], ctxOf).join("\n");
  for (const want of [/b\/decomp: console "N64"/, /b\/decomp: "play" needs/, /x\/stray: verdict/, /x\/stray: title is empty/, /a\/port: missing/, /x\/stray: not in this batch/]) assert.match(p, want);
});

test("triage: an unnamed zip counts as a desktop download only with a word-for-word README quote naming the computer", async () => {
  const { problems, desktopOf } = await import("../scripts/triage.mjs");
  const c = { platforms: [], releases: [{ tag: "v1", files: ["Game.zip"] }], readme: "A native port.\nRequirements: Windows 10/11 64-bit.\n" };
  const ok = { repo: "a/game", verdict: "play", title: "Game", console: "Xbox", reason: "r", platforms: ["Windows", "Linux"], platform_quote: "Requirements: Windows 10/11 64-bit." };
  assert.deepEqual(desktopOf(ok, c), ["Windows"], "Linux isn't in the quote, so it's dropped");
  assert.deepEqual(problems({ results: [ok] }, ["a/game"], () => c), []);
  assert.deepEqual(desktopOf({ ...ok, platform_quote: "Runs on Windows." }, c), [], "a quote that isn't in the README doesn't count");
  assert.deepEqual(desktopOf(ok, { ...c, releases: [] }), [], "no release files, no download");
});

test("triage: a Reddit title becomes a short GitHub search", async () => {
  const { titleQuery } = await import("../scripts/triage.mjs");
  assert.equal(titleQuery("Burnout 3 Takedown Is Finally On PC"), "Burnout 3 Takedown");
  assert.equal(titleQuery("[WIP] Genesis Road Rash 3 native-port and remaster"), "Genesis Road Rash 3 remaster");
  assert.equal(titleQuery("Project Shaolin: Mortal Kombat: Shaolin Monks (original Xbox) static recomp"), "Project Shaolin Mortal Kombat Shaolin");
});
