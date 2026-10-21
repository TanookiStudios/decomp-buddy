import { test } from "node:test";
import assert from "node:assert/strict";
import { newKey, seal, open } from "../src/phonecrypto.js";

test("Phone Link messages: sealed both ways, refused when tampered, stale, replayed or under another key", () => {
  const k = newKey(), seen = new Map(), now = Date.now();
  const env = seal(k, { m: "hello", p: {}, ts: now });
  assert.deepEqual(open(k, env, { now, seen }), { m: "hello", p: {}, ts: now });
  assert.throws(() => open(k, env, { now, seen }), /replayed/);
  assert.throws(() => open(newKey(), seal(k, { m: "x", ts: now })), /./);                       // wrong key
  const t = seal(k, { m: "x", ts: now }); t.ct = Buffer.from(Buffer.from(t.ct, "base64").map((b, i) => (i === 0 ? b ^ 1 : b))).toString("base64");
  assert.throws(() => open(k, t, { now }), /./);                                                 // tampered
  assert.throws(() => open(k, seal(k, { m: "x", ts: now - 10 * 60e3 }), { now }), /stale/);
  assert.throws(() => open(k, { iv: "short", ct: "x" }), /bad message/);
});
