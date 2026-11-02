import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { savedAppCatalog, fetchAppCatalog } from "../src/appcatalog.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "appcat-"));
const doc = (at, n = 2) => ({ schema: 1, generatedAt: at, games: Array.from({ length: n }, (_, i) => ({ id: `g${i}`, title: `Game ${i}` })) });
const put = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d)); return f; };

test("a computer that was never online still gets the built-in catalog, and the newer copy wins", () => {
  const cache = tmp(), bundled = put(path.join(tmp(), "app-catalog.json"), doc("2026-11-01T00:00:00Z", 3));
  assert.equal(savedAppCatalog({ cacheDir: cache, bundled }).from, "built-in");
  assert.equal(savedAppCatalog({ cacheDir: cache, bundled }).games.length, 3);
  put(path.join(cache, "app-catalog.json"), doc("2026-10-20T00:00:00Z")); // saved by an older install
  assert.equal(savedAppCatalog({ cacheDir: cache, bundled }).from, "built-in");
  put(path.join(cache, "app-catalog.json"), doc("2026-11-02T00:00:00Z"));
  assert.equal(savedAppCatalog({ cacheDir: cache, bundled }).from, "saved");
  assert.equal(savedAppCatalog({ cacheDir: tmp(), bundled: "/nope" }), null);
  // An empty or broken file is no catalog at all.
  assert.equal(savedAppCatalog({ cacheDir: tmp(), bundled: put(path.join(tmp(), "x.json"), { games: [] }) }), null);
});

test("a fresh copy is saved for next time; offline, slow or empty answers throw and keep nothing", async () => {
  const cache = tmp();
  const ok = async () => ({ ok: true, json: async () => doc("2026-11-02T00:00:00Z", 4) });
  assert.equal((await fetchAppCatalog({ cacheDir: cache, fetchFn: ok })).from, "fresh");
  assert.equal(savedAppCatalog({ cacheDir: cache, bundled: "/nope" }).games.length, 4);
  const offline = async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }); };
  await assert.rejects(fetchAppCatalog({ cacheDir: tmp(), fetchFn: offline }), /fetch failed/);
  await assert.rejects(fetchAppCatalog({ cacheDir: tmp(), fetchFn: async () => ({ ok: true, json: async () => ({ games: [] }) }) }), /empty/);
  await assert.rejects(fetchAppCatalog({ cacheDir: tmp(), fetchFn: async () => ({ ok: false, status: 503 }) }), /503/);
  const hang = (_u, o) => new Promise((_r, rej) => o.signal.addEventListener("abort", () => rej(o.signal.reason)));
  const t = Date.now(); await assert.rejects(fetchAppCatalog({ cacheDir: tmp(), fetchFn: hang, timeout: 200 }), (e) => e.name === "TimeoutError");
  assert.ok(Date.now() - t < 2000, "a slow website must not hold Browse up");
});

test("the admin's own site file is read straight from disk", async () => {
  const f = put(path.join(tmp(), "app-catalog.json"), doc("2026-11-02T00:00:00Z", 5));
  assert.equal(savedAppCatalog({ cacheDir: tmp(), file: f }).from, "site");
  assert.equal((await fetchAppCatalog({ cacheDir: tmp(), file: f, fetchFn: () => { throw new Error("no network"); } })).games.length, 5);
});
