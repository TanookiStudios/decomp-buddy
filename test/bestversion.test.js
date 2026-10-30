import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRollBack } from "../src/bestversion.js";

const c = (runs, issues, no) => ({ runs, issues, no });
test("goes back only when most players say the new one doesn't run and the old one did", () => {
  assert.equal(shouldRollBack({ "1.3": c(0, 0, 3), "1.2": c(2, 0, 0) }, "1.3", "1.2"), true);
  assert.equal(shouldRollBack({ "1.3": c(0, 0, 2), "1.2": c(5, 0, 0) }, "1.3", "1.2"), false, "two reports isn't enough");
  assert.equal(shouldRollBack({ "1.3": c(2, 0, 2), "1.2": c(5, 0, 0) }, "1.3", "1.2"), false, "a tie isn't most");
  assert.equal(shouldRollBack({ "1.3": c(0, 1, 2), "1.2": c(5, 0, 0) }, "1.3", "1.2"), true);
  assert.equal(shouldRollBack({ "1.3": c(0, 0, 4), "1.2": c(1, 0, 0) }, "1.3", "1.2"), false, "the old one needs two good reports");
  assert.equal(shouldRollBack({ "1.3": c(0, 0, 4), "1.2": c(2, 0, 2) }, "1.3", "1.2"), false, "the old one must mostly run");
  assert.equal(shouldRollBack({ "1.3": c(0, 0, 4) }, "1.3", "1.2"), false, "no reports for the old one");
  assert.equal(shouldRollBack({ "1.3": c(0, 0, 4), "1.2": c(3, 0, 0) }, "1.3", undefined), false, "nothing to go back to");
});
