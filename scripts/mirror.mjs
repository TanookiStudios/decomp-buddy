#!/usr/bin/env node
// Keeps Decomp Buddy's own copy of every download (admin only). The decomp-mirror Worker does the copying, host to
// storage, so nothing passes through this Mac's connection; this script decides what to copy and keeps the ledger.
//   node scripts/mirror.mjs [--dry] [--source] [--apply] [--limit-gb N] [--remove <sha256>]
//   (default)   every scanned-clean release file the app installs today, plus the version before it
//   --source    the source code zip of every listed project, at its released version (source-built games first)
//   Older versions: only the one before the current one (Maddie, 14 Nov 2026: every release ever was 1.8 TB).
// Ledger: public/decomp-buddy/mirror.json { updatedAt, files: { <sha256>: { key, size, at } }, other: { <key>: { size, at, kind, repo, tag } } }
// A file is only ever written to the ledger after the Worker confirmed it stored it; files.decompbuddy.com caches a
// "not found" for hours, so nothing may link a file the ledger doesn't list.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { releaseBuilds, pickRelease } from "../src/scan.js";
import { releasesOf, saveReleases } from "./releases-cache.mjs";
import { applyMirror, sourceJobs } from "../src/mirror.js";
import { DOMAIN } from "../src/forges.js";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const has = (k) => process.argv.includes(k);
const site = arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site");
const DIR = path.join(site, "public", "decomp-buddy"), LEDGER = path.join(DIR, "mirror.json");
const WORKER = "https://decomp-mirror.kirbymail.workers.dev";
const dry = has("--dry"), limitBytes = (Number(arg("--limit-gb")) || Infinity) * 1e9;
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const gb = (n) => `${(n / 1e9).toFixed(1)} GB`;
const enc = encodeURIComponent;
const SITES = Object.fromEntries(Object.entries(DOMAIN).map(([h, d]) => [h, `https://${d}`])); // src/forges.js

const token = process.env.MIRROR_TOKEN || (() => { try { return execFileSync("security", ["find-generic-password", "-a", "decomp-buddy", "-s", "decomp-mirror-token", "-w"], { encoding: "utf8" }).trim(); } catch { return ""; } })();
if (!token && !dry) { console.log("mirror: no Worker key (Keychain decomp-mirror-token) - nothing copied"); process.exit(1); }

const ledger = readJSON(LEDGER, { files: {}, other: {} }); ledger.files ||= {}; ledger.other ||= {};
let dirty = 0;
// The hourly run and a long backfill can both be copying: each save merges with what's on disk, so neither loses the other's work.
const save = (force = false) => {
  if (dry || (!force && dirty < 20) || !dirty) return;
  const disk = readJSON(LEDGER, { files: {}, other: {} });
  ledger.files = { ...disk.files, ...ledger.files }; ledger.other = { ...disk.other, ...ledger.other };
  for (const sha of removed) delete ledger.files[sha];
  ledger.updatedAt = new Date().toISOString(); const t = `${LEDGER}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(ledger)); fs.renameSync(t, LEDGER); dirty = 0;
};
const removed = new Set();
const call = async (p, body) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(WORKER + p, { method: p === "/file" ? "DELETE" : "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30 * 60e3) });
      const j = await r.json().catch(() => ({ ok: false, error: `Worker answered ${r.status}` }));
      if (j.ok || attempt >= 3 || (r.status >= 400 && r.status < 500 && r.status !== 429)) return j;
    } catch (err) { if (attempt >= 3) return { ok: false, error: err.message }; }
    await new Promise((res) => setTimeout(res, 20e3 * attempt));
  }
};

// --remove: take one file down (a takedown request for our copy, or a file flagged after the fact).
if (arg("--remove")) {
  const sha = arg("--remove"), e = ledger.files[sha];
  if (!e) { console.log(`not in the ledger: ${sha}`); process.exit(1); }
  const r = await call("/file", { sha256: sha, name: e.key.split("/").slice(1).join("/") });
  if (r.ok) { delete ledger.files[sha]; removed.add(sha); dirty = 1; save(true); }
  console.log(r.ok ? `removed ${e.key}` : `not removed: ${r.error}`); process.exit(r.ok ? 0 : 1);
}

const PLANS = path.join(DIR, "plans.json"), plans = readJSON(PLANS, null);
if (!plans) { console.log("mirror: no plans.json"); process.exit(1); }
// --apply (hourly run, under its lock): mark on plans.json what we hold, so the app and the website can use our copy.
if (has("--apply")) {
  const held = applyMirror(plans, ledger);
  if (!dry) { const t = `${PLANS}.tmp`; fs.writeFileSync(t, JSON.stringify(plans)); fs.renameSync(t, PLANS); }
  console.log(`mirror: ${held} download(s) and ${Object.values(plans.plans).filter((e) => e.source).length} source zip(s) served from our copy`); process.exit(0);
}
const repoUrl = (planKey) => { const [host, full] = planKey.split(":"); return `${SITES[host] || SITES.github}/${full}`; };
const safe = (s) => String(s).replace(/[^A-Za-z0-9._@+-]/g, "_");
const jobs = [];

if (has("--source")) {
  for (const j of sourceJobs(plans, ledger))
    jobs.push({ kind: "source", path: "/archive", body: { url: j.url, key: j.key, name: j.name }, size: 0, label: `${j.planKey} source @ ${j.tag || "HEAD"}`, record: (r) => { ledger.other[j.key] = { kind: "source", repo: j.planKey, tag: j.tag, size: r.size, at: new Date().toISOString() }; } });
} else {
  // What the app installs today, and the version before it (what "go back" uses), all already scanned clean.
  const items = [];
  for (const { planKey, build } of releaseBuilds(plans)) for (const b of [build, build.previous].filter(Boolean)) {
    const sha = b.scanned?.sha256; if (!sha || b.scanned.flagged || !b.release_tag) continue;
    items.push({ planKey, tag: b.release_tag, name: b.release_asset, sha, size: b.scanned.size, current: b === build });
  }
  items.sort((a, b) => b.current - a.current);
  const seen = new Set(Object.keys(ledger.files));
  for (const it of items) {
    if (seen.has(it.sha)) continue; seen.add(it.sha);
    const [host, full] = it.planKey.split(":"), [owner, repo] = full.split("/");
    let url = host === "github" ? `${repoUrl(it.planKey)}/releases/download/${enc(it.tag)}/${enc(it.name)}` : null;
    if (!url) { try { url = pickRelease(await releasesOf(host, owner, repo), { release_tag: it.tag, release_asset: it.name }).asset?.url; } catch {} }
    if (!url) continue;
    jobs.push({ kind: "release", path: "/copy", body: { url, sha256: it.sha, name: it.name, size: it.size }, size: it.size, label: `${full} ${it.tag} ${it.name}`, record: () => { ledger.files[it.sha] = { key: `${it.sha}/${it.name}`, size: it.size, at: new Date().toISOString(), repo: it.planKey, tag: it.tag, scanned: true }; } });
  }
  saveReleases();
}

const total = jobs.reduce((n, j) => n + (j.size || 0), 0);
console.log(`mirror: ${jobs.length} file(s) to copy${total ? ` (${gb(total)}${jobs.some((j) => !j.size) ? " + sizes unknown until copied" : ""})` : ""}`);
if (dry) process.exit(0);

let i = 0, done = 0, failed = 0, bytes = 0; const fails = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < jobs.length && bytes < limitBytes) {
    const j = jobs[i++], r = await call(j.path, j.body);
    if (r.ok) { j.record(r); dirty++; done++; bytes += r.size || 0; save(); }
    else { failed++; fails.push(`${j.label}: ${r.error}`); }
    if ((done + failed) % 100 === 0) console.log(`  ${done + failed}/${jobs.length} - ${gb(bytes)} copied, ${failed} failed`);
  }
}));
save(true);
console.log(`mirror: ${done} copied (${gb(bytes)}), ${failed} failed, ${jobs.length - done - failed} left for the next run`);
if (fails.length) { fs.writeFileSync(path.join(os.homedir(), ".decomp-buddy-scan", "mirror-failed.txt"), fails.join("\n") + "\n"); console.log(`failures listed in ~/.decomp-buddy-scan/mirror-failed.txt (first: ${fails[0]})`); }
