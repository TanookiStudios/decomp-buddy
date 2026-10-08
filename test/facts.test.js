import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFacts, healthOf, renderFactsContext, Facts } from "../src/facts.js";

const ctx = { fullName: "a/b", description: "PC port", readme: "Fully playable from start to finish. Tested on Steam Deck.\nSaves live in %APPDATA%/b/saves.", docs: [], archived: false, pushedAt: "2021-01-01T00:00:00Z" };

test("healthOf: archived, last push, and takedown language come from the host, not the model", () => {
  assert.deepEqual(healthOf(ctx), { archived: false, pushedAt: "2021-01-01T00:00:00Z", dmca: false });
  assert.equal(healthOf({ ...ctx, readme: "This repo was taken down following a DMCA notice." }).dmca, true);
  assert.equal(healthOf({ ...ctx, archived: true }).archived, true);
});

test("extractFacts: schema-shaped answer, controller notes capped at 3, health and version attached", async () => {
  let seen;
  const ask = async (_p, { schema, user }) => { seen = user; return schema.parse({ completeness: "playable", completeness_quote: "Fully playable from start to finish.", steam_deck: "verified", deck_quote: "Tested on Steam Deck.", save_paths: [{ platform: "windows", path: "%APPDATA%/b/saves" }], config: { file: null, format: "unknown", keys: { fullscreen: null, resolution: null, ultrawide: null, vsync: null } }, controller_notes: ["a", "b", "c", "d"] }); };
  const f = await extractFacts(ctx, { provider: {}, ask });
  assert.equal(f.completeness, "playable"); assert.equal(f.controller_notes.length, 3); assert.equal(f.version, 1); assert.equal(f.health.archived, false);
  assert.match(seen, /Fully playable/);
});

test("renderFactsContext stays under the size cap", () => {
  assert.ok(renderFactsContext({ ...ctx, readme: "x".repeat(200_000) }).length <= 60_000);
  assert.equal(Facts.safeParse({ completeness: "finished" }).success, false);
});

test("groundFacts drops claims the README doesn't back (the model guesses even when told not to)", async () => {
  const { groundFacts } = await import("../src/facts.js");
  const text = "To play on Steam Deck, extract the Linux build. Saves go to %LOCALAPPDATA%\\Zelda\\saves. Settings live in config.json with the key fullscreen_mode and gfxbackend.";
  const f = groundFacts({ completeness: "mostly", completeness_quote: "To play on Steam Deck, extract the Linux build.", steam_deck: "verified", deck_quote: "To play on Steam Deck, extract the Linux build.",
    save_paths: [{ platform: "windows", path: "%LOCALAPPDATA%/Zelda/saves" }, { platform: "linux", path: "~/.config/zelda" }],
    config: { file: "config.json", format: "json", keys: { fullscreen: "fullscreen_mode", resolution: "gfxbackend", ultrawide: null, vsync: null } }, controller_notes: ["invented line"] }, text);
  assert.equal(f.completeness, "unknown");            // quote isn't about completeness
  assert.equal(f.steam_deck, "works");                // instructions, not a verification claim
  assert.deepEqual(f.save_paths.map((p) => p.platform), ["windows"]); // backslashes vs slashes still match; invented linux path dropped
  assert.equal(f.config.keys.fullscreen, "fullscreen_mode"); assert.equal(f.config.keys.resolution, null);
  assert.deepEqual(f.controller_notes, []);
});

test("extractFacts asks once more when the answer doesn't fit the schema", async () => {
  const { extractFacts } = await import("../src/facts.js");
  let calls = 0;
  const ask = async () => { calls++; if (calls === 1) throw new Error("Failed to parse structured output: [zod]"); return { completeness: "unknown", completeness_quote: "", steam_deck: "none", deck_quote: "", save_paths: [], config: { file: null, format: "unknown", keys: { fullscreen: null, resolution: null, ultrawide: null, vsync: null } }, controller_notes: [] }; };
  const f = await extractFacts({ readme: "", docs: [], fullName: "a/b", archived: false }, { provider: {}, ask });
  assert.equal(calls, 2); assert.equal(f.completeness, "unknown");
  await assert.rejects(extractFacts({ readme: "" }, { provider: {}, ask: async () => { throw new Error("credit balance too low"); } }), /credit/);
});

test("groundFacts accepts a quote copied out of a markdown quote block (the > marks aren't part of the sentence)", async () => {
  const { groundFacts } = await import("../src/facts.js");
  const text = "## README\n> As of 26 September 2026 the game is\n> playable into chapter 2 at a steady **60 fps** on Apple Silicon: story\n> missions work.";
  const base = { steam_deck: "none", deck_quote: "", save_paths: [], config: { file: null, format: "unknown", keys: { fullscreen: null, resolution: null, ultrawide: null, vsync: null } }, controller_notes: [] };
  const f = groundFacts({ ...base, completeness: "mostly", completeness_quote: "As of 26 September 2026 the game is playable into chapter 2 at a steady **60 fps** on Apple Silicon" }, text);
  assert.equal(f.completeness, "mostly");
  const made = groundFacts({ ...base, completeness: "playable", completeness_quote: "The game is fully playable from start to end." }, text);
  assert.equal(made.completeness, "unknown", "a sentence that isn't in the text still gets dropped");
});

test("groundFacts counts 'plays the whole game / all endings' as a completeness statement", async () => {
  const { groundFacts } = await import("../src/facts.js");
  const text = "## README\nPlays the whole game, all four endings, with save support.";
  const f = groundFacts({ completeness: "playable", completeness_quote: "Plays the whole game, all four endings", steam_deck: "none", deck_quote: "", save_paths: [], config: { file: null, format: "unknown", keys: { fullscreen: null, resolution: null, ultrawide: null, vsync: null } }, controller_notes: [] }, text);
  assert.equal(f.completeness, "playable");
});

test("groundFacts counts 'work-in-progress' and 'still in development' as completeness statements", async () => {
  const { groundFacts } = await import("../src/facts.js");
  const base = { steam_deck: "none", deck_quote: "", save_paths: [], config: { file: null, format: "unknown", keys: { fullscreen: null, resolution: null, ultrawide: null, vsync: null } }, controller_notes: [] };
  for (const q of ["This port is a work-in-progress.", "Still in development: bugs can and will occur."]) {
    assert.equal(groundFacts({ ...base, completeness: "wip", completeness_quote: q }, `## README\n${q}`).completeness, "wip", q);
  }
});

test("groundFacts: 'in development mode' isn't a completeness statement, 'still in development' is", async () => {
  const { groundFacts } = await import("../src/facts.js");
  const base = { steam_deck: "none", deck_quote: "", save_paths: [], config: { file: null, format: "unknown", keys: { fullscreen: null, resolution: null, ultrawide: null, vsync: null } }, controller_notes: [] };
  const q1 = "Run the game in development mode with --dev.";
  assert.equal(groundFacts({ ...base, completeness: "playable", completeness_quote: q1 }, `## README\n${q1}`).completeness, "unknown");
  const q2 = "The port is still under active development.";
  assert.equal(groundFacts({ ...base, completeness: "wip", completeness_quote: q2 }, `## README\n${q2}`).completeness, "wip");
});
