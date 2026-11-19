import { test } from "node:test";
import assert from "node:assert/strict";

test("renameFromPlan: a code-named entry takes its plan's game name and keeps its old page addresses", async () => {
  const { renameFromPlan } = await import("../src/publiccatalog.js");
  const plan = (t) => ({ targets: { windows: { games: [{ game_title: t }] }, linux: { games: [{ game_title: t }] } } });
  const g = { title: "MediEvilRecomp", console: "PlayStation", owner: "BlackLabelHQ", repo: "MediEvilRecomp" };
  assert.deepEqual(renameFromPlan(g, plan("MediEvil")), ["medievilrecomp-playstation", "medievilrecomp-playstation-blacklabelhq"]);
  assert.equal(g.title, "MediEvil");
  const c = { title: "conker64 recompiled", console: "Nintendo 64", owner: "x", repo: "conker64-recompiled" };
  renameFromPlan(c, plan("Conker's Bad Fur Day")); assert.equal(c.title, "Conker's Bad Fur Day");
  const real = { title: "Super Mario 64 Plus", console: "Nintendo 64", owner: "x", repo: "sm64plus" };
  assert.equal(renameFromPlan(real, plan("Super Mario 64")), null);   // a real name with spaces is kept
  assert.equal(real.title, "Super Mario 64 Plus");
  const two = { title: "Collection", console: "PC", owner: "x", repo: "collection" };
  assert.equal(renameFromPlan(two, { targets: { windows: { games: [{ game_title: "A" }, { game_title: "B" }] } } }), null);
});

test("easySetup: a ready download, one picked file and three steps is easy; a folder drop, a BIOS or a source build is not", async () => {
  const { easySetup } = await import("../src/publiccatalog.js");
  const game = (over = {}) => ({ game_title: "Zelda", build: { method: "release" }, first_run: ["a", "b"], game_files: [{ kind: "game", how_provided: "in_app_picker" }], ...over });
  const plan = (...gs) => ({ targets: { windows: { games: gs } } });
  assert.equal(easySetup(plan(game())), true);
  assert.equal(easySetup(plan(game({ game_files: [] }))), true);
  assert.equal(easySetup(plan(game({ build: { method: "source" } }))), false);
  assert.equal(easySetup(plan(game({ first_run: ["a", "b", "c", "d"] }))), false);
  assert.equal(easySetup(plan(game({ game_files: [{ kind: "game", how_provided: "folder" }] }))), false);
  assert.equal(easySetup(plan(game({ game_files: [{ kind: "bios", how_provided: "in_app_picker" }] }))), false);
  assert.equal(easySetup(plan(game(), game({ game_title: "Hard", build: { method: "source" } })), "Zelda"), true);   // one card of a collection
  assert.equal(easySetup(plan(game(), game({ game_title: "Hard", build: { method: "source" } }))), false);
  assert.equal(easySetup(null), false);
});
