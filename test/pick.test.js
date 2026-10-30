import { test } from "node:test";
import assert from "node:assert/strict";
import { pickGames } from "../src/pick.js";

const g = (title, console, facts = {}, platforms = ["Windows"]) => ({ id: title, title, console, platforms, facts });
const games = [
  g("Mario Kart 64", "Nintendo 64", { completeness: "playable", features: { coop: "q", widescreen: "q" } }),
  g("Mario Kart 64 (Other Port)", "Nintendo 64", { completeness: "mostly", features: { coop: "q" } }),
  g("Zelda", "Nintendo 64", { completeness: "playable", features: { hd: "q" } }, ["Windows", "Linux"]),
  g("Sonic", "Sega Genesis", { completeness: "partial", features: { online: "q" } }),
  g("Unfinished", "Nintendo 64", { completeness: "wip", features: { coop: "q" } }),
];
const first = () => 0;

test("all three answers are respected", () => {
  assert.deepEqual(pickGames(games, { console: "Nintendo 64", how: "together", matters: "looks" }, { rand: first }).picks.map((x) => x.title), ["Mario Kart 64"]);
  assert.deepEqual(pickGames(games, { how: "online" }, { rand: first }).picks.map((x) => x.title), ["Sonic"]);
  assert.deepEqual(pickGames(games, { matters: "deck" }, { rand: first }).picks.map((x) => x.title), ["Zelda"]);
});
test("never a game that isn't playable yet, never two ports of one game", () => {
  const r = pickGames(games, { console: "Nintendo 64", how: "together" }, { rand: first, n: 3 });
  assert.ok(!r.picks.some((x) => x.title === "Unfinished"));
  assert.equal(r.picks.filter((x) => x.title.startsWith("Mario Kart 64")).length, 1);
});
test("when nothing fits everything, it lets go of the last answer and says so", () => {
  const r = pickGames(games, { console: "Sega Genesis", how: "online", matters: "complete" }, { rand: first });
  assert.equal(r.relaxed, true); assert.equal(r.picks[0].title, "Sonic");
  assert.equal(pickGames(games, { console: "Nintendo 64" }, { rand: first }).relaxed, false);
});
