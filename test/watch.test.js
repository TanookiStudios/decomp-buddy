import { test } from "node:test";
import assert from "node:assert/strict";
import { soonKey, gameKey, newlyPlayable } from "../src/watch.js";

test("a Coming Soon entry and its catalog game share one key", () => {
  assert.equal(soonKey({ repo: "Toyz/Piney_Apples" }), gameKey({ owner: "toyz", repo: "piney_apples" }));
  assert.equal(soonKey({ repo: "a/b", host: "gitlab" }), "gitlab:a/b");
  assert.notEqual(soonKey({ repo: "a/b", host: "gitlab" }), gameKey({ owner: "a", repo: "b" }));
});

test("only watched projects that reached the catalog, once each", () => {
  const watch = { "github:toyz/piney_apples": { title: ".hack" }, "github:x/y": { title: "Not Yet" } };
  const games = [{ id: "1", title: ".hack Infection", owner: "Toyz", repo: "piney_apples" }, { id: "2", title: ".hack Mutation", owner: "Toyz", repo: "piney_apples" }, { id: "3", title: "Other", owner: "z", repo: "z" }];
  assert.deepEqual(newlyPlayable(watch, games), [{ key: "github:toyz/piney_apples", title: ".hack", id: "1" }]);
  assert.deepEqual(newlyPlayable({}, games), []);
});
