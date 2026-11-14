import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { downloadFrom } from "../src/setup.js";
import { fileUrl } from "../src/mirror.js";

const body = Buffer.from("the real game file");
const sha = crypto.createHash("sha256").update(body).digest("hex");
const ours = fileUrl(sha, "game.zip"), theirs = "https://github.com/o/r/releases/download/v1/game.zip";
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "dlfrom-")); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return path.join(d, "game.zip"); };

test("downloads come from Decomp Buddy's copy first, checked against the scanned file", async (t) => {
  const asked = [], log = [];
  const r = await downloadFrom([ours, theirs], tmp(t), (m) => log.push(m), { digest: `sha256:${sha}`, scanned: true, retries: 0, fetchImpl: async (u) => { asked.push(u); return new Response(body); } });
  assert.deepEqual(asked, [ours]); assert.equal(r.from, ours); assert.equal(r.verified, true);
  assert.ok(log.includes("  from Decomp Buddy's copy"));
});

test("our copy missing or wrong: the project's own download is used, still held to the same checksum", async (t) => {
  const asked = [];
  const r = await downloadFrom([ours, theirs], tmp(t), () => {}, { digest: `sha256:${sha}`, scanned: true, retries: 0, fetchImpl: async (u) => { asked.push(u); return u === ours ? new Response("tampered") : new Response(body); } });
  assert.deepEqual(asked, [ours, theirs]); assert.equal(r.from, theirs);
  await assert.rejects(downloadFrom([ours, theirs], tmp(t), () => {}, { digest: `sha256:${sha}`, scanned: true, retries: 0, fetchImpl: async () => new Response("tampered") }), /changed since Decomp Buddy scanned it/);
});
