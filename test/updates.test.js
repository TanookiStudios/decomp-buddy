import test from "node:test";
import assert from "node:assert/strict";
import { updateFailed } from "../src/updates.js";

test("an update downloaded but still not installed after a restart counts as failed", () => {
  assert.equal(updateFailed("0.33.0", "0.32.4"), true);
  assert.equal(updateFailed("0.33.0", "0.33.0"), false);
  assert.equal(updateFailed("0.33.0", "0.34.0"), false);
  assert.equal(updateFailed(undefined, "0.33.0"), false);
});
