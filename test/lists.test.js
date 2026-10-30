import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLists } from "../src/lists.js";

const g = (title, extra) => ({ title, console: "Nintendo 64", platforms: ["Windows"], facts: {}, ...extra });
const now = Date.parse("2026-10-28T12:00:00Z");
const games = [
  g("Zelda", { facts: { completeness: "playable", features: { widescreen: 1, hd: 1, coop: 0 } }, size: 30 * 1048576, listedAt: "2026-10-20" }),
  g("Kart", { facts: { completeness: "mostly", features: { coop: 1 } }, size: 500 * 1048576, listedAt: "2026-08-01" }),
  g("Deck Game", { console: "PC", facts: { completeness: "partial", steam_deck: "works" } }),
  g("Linux Game", { console: "PC", platforms: ["Linux"], facts: { completeness: "playable" } }),
  g("Unfinished", { facts: { completeness: "wip", features: { coop: 1, widescreen: 1, hd: 1 } }, listedAt: "2026-10-27" }),
];

test("each list follows its rule, and never lists a game that isn't playable yet", () => {
  const l = buildLists(games, now);
  assert.deepEqual(l["best-nintendo-64"].map((x) => x.title), ["Zelda", "Kart"]);
  assert.deepEqual(l["great-on-steam-deck"].map((x) => x.title).sort(), ["Deck Game", "Linux Game"]);
  assert.deepEqual(l["play-together"].map((x) => x.title), ["Kart"]);
  assert.deepEqual(l["looks-great"].map((x) => x.title), ["Zelda"]);
  assert.deepEqual(l["under-100-mb"].map((x) => x.title), ["Zelda"]);
  assert.deepEqual(l["new-this-month"].map((x) => x.title), ["Zelda"]);
  assert.ok(!Object.values(l).flat().some((x) => x.title === "Unfinished"));
  const two = buildLists([g("Kart (Port A)", { facts: { completeness: "playable", features: { coop: 1, hd: 1 } } }), g("Kart", { facts: { completeness: "mostly", features: { coop: 1 } } })], now);
  assert.deepEqual(two["play-together"].map((x) => x.title), ["Kart (Port A)"]);
});
