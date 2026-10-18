import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPin, checkPin, validPin, pinGate } from "../src/kiosk.js";

test("a PIN is stored as a salted hash and only the same PIN matches", () => {
  const rec = hashPin("4821");
  assert.ok(!JSON.stringify(rec).includes("4821"));
  assert.match(rec.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hashPin("4821").salt, rec.salt);
  assert.equal(checkPin("4821", rec), true);
  assert.equal(checkPin("4822", rec), false);
  assert.equal(checkPin("48210", rec), false);
});

test("bad PINs and broken records never match", () => {
  for (const p of ["123", "123456789", "12a4", "", null]) assert.equal(validPin(p), false);
  assert.throws(() => hashPin("12"));
  assert.equal(checkPin("4821", null), false);
  assert.equal(checkPin("4821", { salt: "ab", hash: "short" }), false);
});

test("three wrong tries make it wait 3 seconds", () => {
  const rec = hashPin("1234"), gate = pinGate();
  assert.deepEqual(gate("0000", rec, 0), { ok: false });
  assert.deepEqual(gate("0000", rec, 1), { ok: false });
  assert.deepEqual(gate("0000", rec, 2), { ok: false, wait: 3000 });
  assert.equal(gate("1234", rec, 1000).ok, false); // the right PIN still waits
  assert.equal(gate("1234", rec, 3002).ok, true);
});
