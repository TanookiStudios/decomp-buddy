import { test } from "node:test";
import assert from "node:assert/strict";
import { gh } from "../src/github.js";

const reply = (status, body, headers = {}) => async () => new Response(body, { status, headers });

test("a rate-limited GitHub reply is an error, never content", async (t) => {
  t.mock.method(globalThis, "fetch", reply(403, '{"message":"API rate limit exceeded for 203.0.113.9."}', { "x-ratelimit-remaining": "0" }));
  await assert.rejects(gh("/repos/a/b/readme", "application/vnd.github.raw+json"), (e) => /limiting lookups/.test(e.message) && !/203\.0\.113\.9/.test(e.message));
  t.mock.method(globalThis, "fetch", reply(429, "slow down"));
  await assert.rejects(gh("/repos/a/b"), /limiting lookups/);
});

test("a missing README is null, a real one is its text", async (t) => {
  t.mock.method(globalThis, "fetch", reply(404, '{"message":"Not Found"}'));
  assert.equal(await gh("/repos/a/b/readme", "application/vnd.github.raw+json"), null);
  t.mock.method(globalThis, "fetch", reply(200, "# Hello"));
  assert.equal(await gh("/repos/a/b/readme", "application/vnd.github.raw+json"), "# Hello");
});
