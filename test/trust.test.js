import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadedBy } from "../src/trust.js";

test("who uploaded the downloads", () => {
  assert.deepEqual(uploadedBy(["Alice", "alice"], "alice"), { by: "owner", uploaders: ["Alice", "alice"].slice(0, 2) });
  assert.equal(uploadedBy(["alice", "bob"], "alice", ["Bob"]).by, "regular");
  assert.deepEqual(uploadedBy(["mallory"], "alice", ["bob"]), { by: "other", uploaders: ["mallory"] });
  assert.equal(uploadedBy([null, undefined], "alice"), null);
});

test("a project's own GitHub workflow isn't 'someone else'", () => {
  assert.deepEqual(uploadedBy(["github-actions[bot]"], "alice"), { by: "bot", uploaders: [] });
  assert.equal(uploadedBy(["github-actions[bot]", "alice"], "alice").by, "owner");
});
