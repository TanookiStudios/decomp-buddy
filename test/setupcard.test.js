import { test } from "node:test";
import assert from "node:assert/strict";
import { setupCard } from "../src/setupcard.js";

test("How To Set Up: this computer's steps first, the right game of a collection, nothing for an unsupported build", () => {
  const game = (t, over = {}) => ({ game_title: t, build: { method: "release" }, game_files: [{ label: `${t} ROM`, description: "Your own copy." }], first_run: ["Open it.", ""], ...over });
  const entry = { targets: { windows: { games: [game("Zelda"), game("Mario")] }, linux: { games: [game("Zelda", { first_run: ["Linux way."] })] }, vita: { games: [game("Zelda", { build: { method: "unsupported" } })] } } };
  assert.deepEqual(setupCard(entry, { target: "linux" }), { target: "linux", files: [{ label: "Zelda ROM", description: "Your own copy." }], steps: ["Linux way."] });
  assert.equal(setupCard(entry, { target: "macos-x64" }).target, "windows");                 // no steps for that computer: Windows'
  assert.equal(setupCard(entry, { gameTitle: "mario" }).files[0].label, "Mario ROM");
  assert.equal(setupCard({ targets: { vita: entry.targets.vita } }), null);
  assert.equal(setupCard(null), null);
});
