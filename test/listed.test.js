import { test } from "node:test";
import assert from "node:assert/strict";
import { stampListed } from "../src/listed.js";

test("first build: hand-found games keep their date, the rest get the baseline, not today", () => {
  const games = [{ id: "a", repo: "X/A" }, { id: "b", repo: "y/b" }];
  const seen = stampListed(games, {}, { addedAt: { "x/a": "2026-10-20T10:00:00Z" }, today: "2026-10-28", baseline: "2026-09-13" });
  assert.deepEqual(games.map((g) => g.listedAt), ["2026-10-20", "2026-09-13"]);
  assert.deepEqual(seen, { a: "2026-10-20", b: "2026-09-13" });
});

test("later builds: a known game keeps its date, a new one is dated today", () => {
  const games = [{ id: "a", repo: "x/a" }, { id: "c", repo: "z/c" }];
  stampListed(games, { a: "2026-10-20" }, { today: "2026-10-29", baseline: "2026-09-13" });
  assert.deepEqual(games.map((g) => g.listedAt), ["2026-10-20", "2026-10-29"]);
});
