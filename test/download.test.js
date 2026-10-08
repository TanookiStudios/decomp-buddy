import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { download, DownloadCtrl } from "../src/setup.js";

const body = crypto.randomBytes(3 * 1024 * 1024);
const sha = `sha256:${crypto.createHash("sha256").update(body).digest("hex")}`;
// Drops the connection after 1 MB on the first request; honours Range after that.
function server({ drop = true, range = true } = {}) {
  let first = true; const seen = [];
  const s = http.createServer((req, res) => {
    const m = /bytes=(\d+)-/.exec(req.headers.range || ""); seen.push(req.headers.range || "full");
    const start = range && m ? Number(m[1]) : 0;
    res.writeHead(start ? 206 : 200, { "Content-Length": body.length - start });
    if (drop && first) { first = false; res.write(body.subarray(start, start + 1024 * 1024)); setTimeout(() => req.socket.destroy(), 20); return; }
    res.end(body.subarray(start));
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ s, url: `http://127.0.0.1:${s.address().port}/f.zip`, seen })));
}
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dl-")), "f.zip");

test("download resumes after a dropped connection (Range) and still verifies the digest", async () => {
  const { s, url, seen } = await server(); const dest = tmp();
  try { const r = await download(url, dest, () => {}, { digest: sha, backoff: 10 }); assert.equal(r.verified, true); }
  finally { s.close(); }
  assert.ok(fs.readFileSync(dest).equals(body)); assert.equal(fs.existsSync(`${dest}.part`), false);
  assert.equal(seen[0], "full"); assert.match(seen[1], /^bytes=\d+-$/);
});

test("download starts over when the server ignores Range", async () => {
  const { s, url } = await server({ range: false }); const dest = tmp();
  try { await download(url, dest, () => {}, { digest: sha, backoff: 10 }); } finally { s.close(); }
  assert.ok(fs.readFileSync(dest).equals(body));
});

test("cancel deletes the partial file; a 404 isn't retried", async () => {
  const ctrl = new DownloadCtrl(); ctrl.cancel();
  await assert.rejects(download("http://127.0.0.1:9/x", tmp(), () => {}, { ctrl }), /Cancelled/);
  const s = http.createServer((q, r) => { r.writeHead(404); r.end(); }); await new Promise((r) => s.listen(0, "127.0.0.1", r));
  let calls = 0; const f = (u, o) => { calls++; return fetch(u, o); };
  try { await assert.rejects(download(`http://127.0.0.1:${s.address().port}/x`, tmp(), () => {}, { fetchImpl: f, backoff: 1 }), /404/); } finally { s.close(); }
  assert.equal(calls, 1);
});

test("pause stops the download; resume carries on from the bytes already on disk", async () => {
  const seen = [];
  const s = http.createServer((req, res) => {
    const m = /bytes=(\d+)-/.exec(req.headers.range || ""); const start = m ? Number(m[1]) : 0; seen.push(start);
    res.writeHead(start ? 206 : 200, { "Content-Length": body.length - start });
    let i = start; const tick = setInterval(() => { if (i >= body.length) { clearInterval(tick); return res.end(); } res.write(body.subarray(i, i + 64 * 1024)); i += 64 * 1024; }, 5);
    res.on("close", () => clearInterval(tick));
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const ctrl = new DownloadCtrl(); const dest = tmp(); const lines = [];
  const p = download(`http://127.0.0.1:${s.address().port}/f.zip`, dest, (m) => lines.push(m), { digest: sha, ctrl });
  await new Promise((r) => setTimeout(r, 60)); ctrl.pause();
  await new Promise((r) => setTimeout(r, 150)); const partAtPause = fs.statSync(`${dest}.part`).size;
  await new Promise((r) => setTimeout(r, 150)); assert.equal(fs.statSync(`${dest}.part`).size, partAtPause); // nothing while paused
  ctrl.resume();
  try { assert.equal((await p).verified, true); } finally { s.close(); }
  assert.ok(fs.readFileSync(dest).equals(body));
  assert.ok(seen.length >= 2 && seen[1] > 0, `second request resumed at ${seen[1]}`);
  assert.ok(lines.some((l) => /paused/.test(l)) && lines.some((l) => /resuming at/.test(l)));
});
