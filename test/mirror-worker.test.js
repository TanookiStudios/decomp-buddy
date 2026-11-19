import test from "node:test";
import assert from "node:assert/strict";
import worker, { problemWith, authorized } from "../workers/mirror/index.js";

const SHA = "a".repeat(64);
const ok = { url: "https://github.com/o/r/releases/download/v1/game.zip", sha256: SHA, name: "game.zip", size: 10 };
const req = (body, token = "s3cret", method = "POST", path = "/copy") => new Request(`https://m.example${path}`, { method, headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

test("mirror worker: only copies from public web addresses, with a real hash, name and size", () => {
  assert.equal(problemWith(ok), null);
  assert.equal(problemWith({ ...ok, url: "https://my-ports.example.org/files/game.zip" }), null); // any site (the hash still has to match)
  for (const u of ["https://localhost/game.zip", "https://127.0.0.1/game.zip", "https://[::1]/game.zip", "https://10.0.0.5:8080/game.zip"]) assert.match(problemWith({ ...ok, url: u }), /not a host/, u);
  assert.match(problemWith({ ...ok, url: "http://github.com/x" }), /not a host/);
  assert.match(problemWith({ ...ok, sha256: "abc" }), /sha256/);
  assert.match(problemWith({ ...ok, name: "../x" }), /name/);
  assert.match(problemWith({ ...ok, size: 0 }), /size/);
});

test("mirror worker: refuses a wrong or missing key", async () => {
  assert.equal(await authorized(req(ok, "nope"), "s3cret"), false);
  assert.equal(await authorized(req(ok), ""), false);
  assert.equal(await authorized(req(ok), "s3cret"), true);
  const r = await worker.fetch(req(ok, "nope"), { TOKEN: "s3cret" });
  assert.equal(r.status, 401);
});

test("mirror worker: a file R2 already has isn't fetched again; a hash mismatch is not stored", async (t) => {
  const stored = new Map([[`${SHA}/game.zip`, 10]]);
  const env = { TOKEN: "s3cret", FILES: { head: async (k) => (stored.has(k) ? { size: stored.get(k) } : null), put: async (k, body, o) => { if (o.sha256 !== "b".repeat(64)) throw new Error("checksum mismatch"); stored.set(k, 1); } } };
  const real = globalThis.fetch; t.after(() => { globalThis.fetch = real; });
  let fetched = 0; globalThis.fetch = async () => { fetched++; return new Response("0123456789", { headers: { "content-length": "10" } }); };
  assert.deepEqual(await (await worker.fetch(req(ok), env)).json(), { ok: true, existed: true, size: 10 });
  assert.equal(fetched, 0);
  const bad = await worker.fetch(req({ ...ok, sha256: "c".repeat(64) }), env);
  assert.equal(bad.status, 422); assert.equal(stored.has(`${"c".repeat(64)}/game.zip`), false);
  const good = await worker.fetch(req({ ...ok, sha256: "b".repeat(64) }), env);
  assert.equal((await good.json()).ok, true); assert.equal(fetched, 2);
});

test("mirror worker: archive keys stay inside source/ or byname/", async () => {
  const { archiveKeyOk } = await import("../workers/mirror/index.js");
  assert.equal(archiveKeyOk("source/github/o/r/v1.0.zip"), true);
  assert.equal(archiveKeyOk("byname/github:o/r/v1/game.zip"), false); // no colons
  assert.equal(archiveKeyOk("byname/github/o/r/v1/game.zip"), true);
  assert.equal(archiveKeyOk("source/../secret"), false);
  assert.equal(archiveKeyOk("abc123/game.zip"), false);
});

test("mirror worker: a scan record without a size uses the host's Content-Length", async (t) => {
  const stored = new Map();
  const env = { TOKEN: "s3cret", FILES: { head: async () => null, put: async (k) => { stored.set(k, true); } } };
  const real = globalThis.fetch; t.after(() => { globalThis.fetch = real; });
  globalThis.fetch = async () => new Response("0123456789", { headers: { "content-length": "10" } });
  const { size, ...noSize } = ok;
  const r = await (await worker.fetch(req(noSize), env)).json();
  assert.deepEqual(r, { ok: true, size: 10 }); assert.equal(size, 10);
});
