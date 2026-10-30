import { test } from "node:test";
import assert from "node:assert/strict";
import { recentGames, playLink } from "../src/quickplay.js";

test("the most recently played games on this computer, newest first", () => {
  const lib = [
    { folder: "/g/a", title: "A", lastPlayed: "2026-10-01T00:00:00Z" },
    { folder: "/g/b", title: "B", lastPlayed: "2026-10-03T00:00:00Z" },
    { folder: "/g/c", title: "C" }, // never played
    { folder: "/g/d", title: "D", lastPlayed: "2026-10-04T00:00:00Z", onDevice: true }, // on a headset
    { folder: "/g/e", title: "E", lastPlayed: "2026-10-02T00:00:00Z" },
  ];
  assert.deepEqual(recentGames(lib).map((g) => g.title), ["B", "E", "A"]);
  assert.equal(recentGames(lib, 2).length, 2);
});
test("the jump-list link carries the folder and this install's key", () => {
  assert.equal(playLink("C:\\Games\\Zelda 64", "ab12"), "decompbuddy://play?folder=C%3A%5CGames%5CZelda%2064&k=ab12");
});
