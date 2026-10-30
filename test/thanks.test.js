import { test } from "node:test";
import assert from "node:assert/strict";
import { thankDue, playedText } from "../src/thanks.js";

test("thanks are offered once, after an hour, for the most recently played", () => {
  const lib = [
    { title: "A", playMinutes: 59, repoUrl: "u", lastPlayed: "2026-10-05" },
    { title: "B", playMinutes: 300, repoUrl: "u", lastPlayed: "2026-10-02" },
    { title: "C", playMinutes: 61, repoUrl: "u", lastPlayed: "2026-10-04" },
    { title: "D", playMinutes: 900, repoUrl: "u", lastPlayed: "2026-10-09", thanked: true },
    { title: "E", playMinutes: 900, lastPlayed: "2026-10-09" }, // no project page to thank
  ];
  assert.equal(thankDue(lib).title, "C");
  assert.equal(thankDue(lib.filter((g) => g.title !== "C")).title, "B");
  assert.equal(thankDue([lib[0], lib[3]]), null);
});
test("play time in plain words", () => {
  assert.equal(playedText(0.4), ""); assert.equal(playedText(1), "1 minute played"); assert.equal(playedText(45), "45 minutes played");
  assert.equal(playedText(60), "1 hour played"); assert.equal(playedText(725), "12 hours played");
});
