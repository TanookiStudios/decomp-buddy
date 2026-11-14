/* global FixedLengthStream */
// decomp-mirror: POST /copy {url, sha256, name, size} -> stores the file at "<sha256>/<name>" in R2.
// R2 checks the sha256 itself as the file arrives, so a file that isn't byte-for-byte the one we scanned is refused.
// DELETE /file {sha256, name} takes one file down again (scripts/mirror.mjs --remove).

import { DOMAIN } from "../../src/forges.js";

// Every project site Decomp Buddy knows (src/forges.js), plus the addresses GitHub hands its downloads off to.
const HOSTS = new Set([...Object.values(DOMAIN), "api.github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "codeload.github.com"]);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function authorized(request, secret) {
  const got = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!secret || !got) return false;
  // Hash both sides first so the comparison takes the same time whatever the lengths.
  const enc = new TextEncoder(), [a, b] = await Promise.all([got, secret].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b); let diff = 0;
  for (let i = 0; i < 32; i++) diff |= x[i] ^ y[i]; // both are 32-byte hashes: same length, same time
  return diff === 0;
}

/** The checks on what we're asked to copy. Returns an error message, or null. */
export function problemWith({ url, sha256, name, size } = {}) {
  if (!/^[0-9a-f]{64}$/.test(String(sha256))) return "sha256 must be 64 lowercase hex characters";
  if (!name || /[/\\]|^\.\.?$/.test(name) || name.length > 255) return "bad file name";
  if (!Number.isSafeInteger(size) || size <= 0) return "size must be a positive whole number";
  let u; try { u = new URL(url); } catch { return "bad url"; }
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname)) return `not a host we copy from: ${u.hostname}`;
  return null;
}
export const keyOf = (sha256, name) => `${sha256}/${name}`;

async function copy(req, env) {
  const problem = problemWith(req); if (problem) return json({ ok: false, error: problem }, 400);
  const key = keyOf(req.sha256, req.name);
  const have = await env.FILES.head(key);
  if (have) return json({ ok: true, existed: true, size: have.size });
  const api = new URL(req.url).hostname === "api.github.com";
  const res = await fetch(req.url, { headers: { "user-agent": "decomp-buddy-mirror", ...(api ? { accept: "application/octet-stream", ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}) } : {}) } });
  if (!res.ok || !res.body) return json({ ok: false, error: `host answered ${res.status}`, status: res.status }, 502);
  const len = Number(res.headers.get("content-length"));
  if (len && len !== req.size) return json({ ok: false, error: `host says ${len} bytes, expected ${req.size}` }, 409);
  // R2 needs a known length to stream; FixedLengthStream gives it one when the host didn't say.
  let body = res.body;
  if (!len) { const f = new FixedLengthStream(req.size); res.body.pipeTo(f.writable).catch(() => {}); body = f.readable; }
  try {
    await env.FILES.put(key, body, { sha256: req.sha256, httpMetadata: { contentType: "application/octet-stream", contentDisposition: `attachment; filename="${req.name.replace(/"/g, "")}"` } });
  } catch (err) { return json({ ok: false, error: `not stored: ${err.message}` }, 422); }
  return json({ ok: true, size: req.size });
}

// A file with no published hash or length (source code zips, older release files without a digest): streamed into R2
// in 16 MB parts, so it never has to fit in memory. Stored at a readable key under source/ or byname/.
export const archiveKeyOk = (key) => /^(source|byname)\/[A-Za-z0-9._@+\/-]{3,400}$/.test(String(key)) && !String(key).split("/").some((p) => p === "" || p === "." || p === "..");
const PART = 16 * 1024 * 1024;
async function archive({ url, key, name } = {}, env) {
  if (!archiveKeyOk(key)) return json({ ok: false, error: "bad key" }, 400);
  let u; try { u = new URL(url); } catch { return json({ ok: false, error: "bad url" }, 400); }
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname)) return json({ ok: false, error: `not a host we copy from: ${u.hostname}` }, 400);
  const have = await env.FILES.head(key);
  if (have) return json({ ok: true, existed: true, size: have.size });
  const res = await fetch(url, { headers: { "user-agent": "decomp-buddy-mirror" } });
  if (!res.ok || !res.body) return json({ ok: false, error: `host answered ${res.status}`, status: res.status }, 502);
  const file = String(name || key.split("/").pop()).replace(/"/g, "");
  const up = await env.FILES.createMultipartUpload(key, { httpMetadata: { contentType: "application/zip", contentDisposition: `attachment; filename="${file}"` } });
  // A Blob joins the pieces in native code: copying them by hand in JavaScript ran past the Worker's CPU limit (1102).
  // R2 wants every part but the last exactly the same size: cut the joined Blob at PART bytes, keep the rest for next time.
  const parts = [], reader = res.body.getReader(); let buf = [], have2 = 0, size = 0, carry = new Blob([]);
  const flush = async (last) => {
    let all = new Blob([carry, ...buf]); buf = []; have2 = 0;
    while (all.size >= PART && !(last && all.size === 0)) { parts.push(await up.uploadPart(parts.length + 1, all.slice(0, PART))); all = all.slice(PART); }
    carry = all;
    if (last && (carry.size || !parts.length)) { parts.push(await up.uploadPart(parts.length + 1, carry)); carry = new Blob([]); }
  };
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; buf.push(value); have2 += value.length; size += value.length; if (have2 >= PART) await flush(false); }
    await flush(true);
    await up.complete(parts);
  } catch (err) { await up.abort().catch(() => {}); return json({ ok: false, error: `not stored: ${err.message}` }, 422); }
  return json({ ok: true, size });
}

// PUT /put?key=source/...&name=... with the file as the body (Content-Length set): from scripts/mirror-runner.mjs on a
// GitHub build machine, for source zips too big to piece together inside the Worker's CPU limit. A known length lets
// R2 take the body as it streams in, with no work done here.
async function putBody(request, env) {
  const u = new URL(request.url), key = u.searchParams.get("key"), name = String(u.searchParams.get("name") || key.split("/").pop()).replace(/"/g, "");
  const len = Number(request.headers.get("content-length"));
  if (!archiveKeyOk(key) || !String(key).startsWith("source/")) return json({ ok: false, error: "bad key" }, 400);
  if (!len) return json({ ok: false, error: "send Content-Length" }, 411);
  const have = await env.FILES.head(key); if (have) return json({ ok: true, existed: true, size: have.size });
  await env.FILES.put(key, request.body, { httpMetadata: { contentType: "application/zip", contentDisposition: `attachment; filename="${name}"` } });
  return json({ ok: true, size: len });
}

// Files over the Worker's 100 MB upload cap go up in pieces: POST /mpu?key&name -> { uploadId }, PUT /mpu?key&uploadId&n
// with each piece as the body (same size except the last) -> { part }, POST /mpu/done?key&uploadId { parts } -> stored.
async function piece(request, env, path) {
  const u = new URL(request.url), key = u.searchParams.get("key");
  if (!archiveKeyOk(key) || !String(key).startsWith("source/")) return json({ ok: false, error: "bad key" }, 400);
  if (request.method === "POST" && path === "/mpu") {
    const have = await env.FILES.head(key); if (have) return json({ ok: true, existed: true, size: have.size });
    const name = String(u.searchParams.get("name") || key.split("/").pop()).replace(/"/g, "");
    const up = await env.FILES.createMultipartUpload(key, { httpMetadata: { contentType: "application/zip", contentDisposition: `attachment; filename="${name}"` } });
    return json({ ok: true, uploadId: up.uploadId });
  }
  const up = env.FILES.resumeMultipartUpload(key, u.searchParams.get("uploadId"));
  if (request.method === "PUT" && path === "/mpu") {
    if (!Number(request.headers.get("content-length"))) return json({ ok: false, error: "send Content-Length" }, 411);
    return json({ ok: true, part: await up.uploadPart(Number(u.searchParams.get("n")), request.body) });
  }
  if (request.method === "POST" && path === "/mpu/done") {
    try { const o = await up.complete((await request.json()).parts); return json({ ok: true, size: o.size }); }
    catch (err) { await up.abort().catch(() => {}); return json({ ok: false, error: `not stored: ${err.message}` }, 422); }
  }
  return json({ ok: false, error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    if (!(await authorized(request, env.TOKEN))) return json({ ok: false, error: "unauthorized" }, 401);
    const path = new URL(request.url).pathname;
    if (request.method === "PUT" && path === "/put") return putBody(request, env);
    if (path === "/mpu" || path === "/mpu/done") return piece(request, env, path);
    let body; try { body = await request.json(); } catch { return json({ ok: false, error: "send JSON" }, 400); }
    if (request.method === "POST" && path === "/copy") return copy(body, env);
    if (request.method === "POST" && path === "/archive") return archive(body, env);
    // Housekeeping (scripts/mirror.mjs): list what's stored, or delete up to 1,000 named keys at once.
    if (request.method === "POST" && path === "/list") {
      const r = await env.FILES.list({ prefix: body.prefix || undefined, cursor: body.cursor || undefined, limit: 1000 });
      return json({ ok: true, keys: r.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })), cursor: r.truncated ? r.cursor : null });
    }
    if (request.method === "POST" && path === "/delete") {
      const keys = (body.keys || []).filter((k) => /^[0-9a-f]{64}\/[^/\\]+$/.test(k) || archiveKeyOk(k));
      if (!keys.length || keys.length > 1000) return json({ ok: false, error: "send 1 to 1000 keys" }, 400);
      await env.FILES.delete(keys); return json({ ok: true, deleted: keys.length });
    }
    if (request.method === "DELETE" && path === "/file") {
      if (!/^[0-9a-f]{64}$/.test(String(body.sha256)) || !body.name || /[/\\]/.test(body.name)) return json({ ok: false, error: "bad file" }, 400);
      await env.FILES.delete(keyOf(body.sha256, body.name)); return json({ ok: true });
    }
    return json({ ok: false, error: "not found" }, 404);
  },
};
