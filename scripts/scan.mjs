#!/usr/bin/env node
// Scans every published download for malware with ClamAV before it reaches anyone (admin only).
//   node scripts/scan.mjs --site ~/Documents/GitHub/TanookiStudios-Site [--dry] [--limit N] [--only owner/repo] [--rescan]
// Downloads one file at a time into ~/.decomp-buddy-scan/tmp, hashes it, scans it, deletes it, and records the result
// in public/decomp-buddy/scans.json; then copies the results onto plans.json (build.scanned).
// Needs: brew install clamav; virus definitions are refreshed into ~/.decomp-buddy-scan/db on every run.
// GITHUB_TOKEN raises the GitHub limit (one releases call per repo).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { releasesOf, saveReleases } from "./releases-cache.mjs";
import { scanKey, pickRelease, releaseBuilds, applyScans } from "../src/scan.js";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const site = arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site");
const DIR = path.join(site, "public", "decomp-buddy");
const PLANS = path.join(DIR, "plans.json"), SCANS = path.join(DIR, "scans.json"), REVIEWED = path.join(DIR, "scans-reviewed.json");
const HOME = path.join(os.homedir(), ".decomp-buddy-scan"), TMP = path.join(HOME, "tmp"), DB = path.join(HOME, "db");
const SOCK = path.join(HOME, "clamd.sock"), BREW = "/opt/homebrew";
const dry = process.argv.includes("--dry"), rescan = process.argv.includes("--rescan");
const limit = Number(arg("--limit")) || Infinity, only = arg("--only")?.toLowerCase();

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJSON = (f, v, pretty = true) => { const t = `${f}.tmp`; fs.writeFileSync(t, JSON.stringify(v, null, pretty ? 1 : 0)); fs.renameSync(t, f); };
const gb = (n) => `${(n / 1e9).toFixed(1)} GB`;

// One scan at a time: a daily run finds the long first pass still going and leaves it be.
const LOCK = path.join(HOME, "scan.lock");
try { const pid = Number(fs.readFileSync(LOCK, "utf8")); process.kill(pid, 0); console.log(`another scan is running (pid ${pid}) - not starting a second one`); process.exit(0); } catch {}
fs.mkdirSync(HOME, { recursive: true }); fs.writeFileSync(LOCK, String(process.pid));
process.on("exit", () => { try { if (fs.readFileSync(LOCK, "utf8") === String(process.pid)) fs.rmSync(LOCK); } catch {} });
const plans = readJSON(PLANS, null);
if (!plans) { console.log(`no plans.json at ${PLANS}`); process.exit(1); }
const scans = readJSON(SCANS, { files: {} });

// 1. Which file each published build installs (one releases call per repo).
const builds = releaseBuilds(plans, { next: true }).filter((b) => !only || b.planKey.endsWith(`:${only}`));
const byRepo = new Map();
for (const b of builds) (byRepo.get(b.planKey) || byRepo.set(b.planKey, []).get(b.planKey)).push(b);
const todo = new Map(); let gone = 0, unreachable = 0, i = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  const keys = [...byRepo.keys()];
  while (i < keys.length) {
    const key = keys[i++], [host, full] = key.split(":"), [owner, repo] = full.split("/");
    let releases;
    try { releases = await releasesOf(host, owner, repo); }
    catch (err) { if (/rate limit/i.test(err.message)) { console.log(err.message); process.exit(1); } unreachable += byRepo.get(key).length; continue; } // retried next run
    for (const b of byRepo.get(key)) {
      const { release, asset } = pickRelease(releases, b.build), k = scanKey(key, b.build);
      if (!asset) { gone++; continue; }
      const had = scans.files[k];
      // Already scanned and GitHub still serves the same bytes (or can't say otherwise): nothing to do.
      const same = had && !/^Heuristics\.Limits\.Exceeded/.test(had.signature || "") && (asset.digest ? asset.digest === `sha256:${had.sha256}` : had.size === asset.size && had.tag === release.tag);
      if (!same || rescan) todo.set(k, { key: k, repo: full, tag: release.tag, asset });
    }
  }
}));
saveReleases();
const total = [...todo.values()].reduce((n, t) => n + (t.asset.size || 0), 0);
console.log(`${builds.length} published downloads; ${todo.size} file(s) to scan (${gb(total)})${gone ? `; ${gone} no longer in their release` : ""}${unreachable ? `; ${unreachable} skipped (GitHub didn't answer - next run tries again)` : ""}`);
if (dry) { for (const t of [...todo.values()].sort((a, b) => b.asset.size - a.asset.size).slice(0, 15)) console.log(`  ${gb(t.asset.size)}  ${t.repo} ${t.asset.name}`); process.exit(0); }

// 2. Fresh virus definitions, and one clamd for the whole run (loading the database per file takes ~15s).
fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(DB, { recursive: true });
fs.writeFileSync(path.join(HOME, "freshclam.conf"), `DatabaseDirectory ${DB}\nDatabaseMirror database.clamav.net\nCVDCertsDirectory ${BREW}/etc/clamav/certs\n`);
try { execFileSync(`${BREW}/bin/freshclam`, [`--config-file=${path.join(HOME, "freshclam.conf")}`], { stdio: "pipe" }); }
catch (err) { if (!fs.readdirSync(DB).some((f) => /^daily\.c[vl]d$/.test(f))) { console.log(`freshclam failed and there are no definitions yet:\n${err.stderr || err.message}`); process.exit(1); } console.log("freshclam failed - scanning with the definitions already here"); }
// Limits high enough that a big game zip is scanned whole; anything over them, or a password-protected archive, counts as flagged.
fs.writeFileSync(path.join(HOME, "clamd.conf"), [`DatabaseDirectory ${DB}`, `LocalSocket ${SOCK}`, "Foreground yes", "MaxFileSize 4000M", "MaxScanSize 4000M",
  "MaxFiles 200000", "MaxRecursion 40", "AlertExceedsMax yes", "AlertEncrypted yes", "MaxThreads 6", "MaxScanTime 1800000", "ReadTimeout 1800", "CommandReadTimeout 600"].join("\n") + "\n");
fs.rmSync(SOCK, { force: true });
const clamd = spawn(`${BREW}/sbin/clamd`, [`--config-file=${path.join(HOME, "clamd.conf")}`], { stdio: "ignore" });
process.on("exit", () => clamd.kill());
for (let t = 0; !fs.existsSync(SOCK); t++) { if (t > 240) { console.log("clamd didn't start"); process.exit(1); } await new Promise((r) => setTimeout(r, 500)); }
const engine = `ClamAV ${execFileSync(`${BREW}/bin/clamdscan`, [`--config-file=${path.join(HOME, "clamd.conf")}`, "--version"], { encoding: "utf8" }).trim().replace(/^ClamAV /, "")}`;
console.log(`scanner: ${engine}`);

const clamscan = (file) => new Promise((resolve) => {
  const p = spawn(`${BREW}/bin/clamdscan`, [`--config-file=${path.join(HOME, "clamd.conf")}`, "--no-summary", "--fdpass", file]);
  let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  p.on("close", (code) => resolve({ code, out: out.trim() }));
});

async function scanOne(t) {
  const file = path.join(TMP, `${crypto.randomUUID()}-${t.asset.name.replace(/[^\w.-]+/g, "_")}`);
  try {
    const res = await fetch(t.asset.url, { headers: { "User-Agent": "decomp-buddy" } });
    if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
    const hash = crypto.createHash("sha256"); let size = 0;
    await pipeline(Readable.fromWeb(res.body), async function* (src) { for await (const c of src) { hash.update(c); size += c.length; yield c; } }, fs.createWriteStream(file));
    const sha256 = hash.digest("hex");
    if (t.asset.digest && t.asset.digest !== `sha256:${sha256}`) throw new Error("download didn't match GitHub's checksum");
    const { code, out } = await clamscan(file);
    if (code === 2) throw new Error(`scanner error: ${out.split("\n").pop()}`);
    const signature = code === 1 ? out.match(/: (.+) FOUND$/m)?.[1] || "unknown" : null;
    scans.files[t.key] = { sha256, size, tag: t.tag, at: new Date().toISOString(), engine, clean: code === 0, ...(signature ? { signature } : {}) };
    return signature;
  } finally { fs.rmSync(file, { force: true }); }
}

// 3. Four at a time, never filling the disk: wait while free space is under twice the next file plus 3 GB.
const queue = [...todo.values()].slice(0, limit); let done = 0, flagged = 0, failed = 0, inUse = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const t = queue.shift(), need = (t.asset.size || 0);
    const room = () => { const s = fs.statfsSync(TMP); return s.bavail * s.bsize >= need * 2 + inUse + 3e9; };
    while (!room() && inUse) await new Promise((r) => setTimeout(r, 2000));
    if (!room()) { console.log(`not enough disk for ${t.asset.name} (${gb(need)}) - skipped`); failed++; done++; continue; }
    inUse += need;
    try {
      // A dropped connection gets three more tries, a minute apart; anything else is reported once.
      let sig;
      for (let n = 0; ; n++) { try { sig = await scanOne(t); break; } catch (err) { if (n >= 3 || !/fetch failed|terminated|ECONNRESET|ETIMEDOUT|download 5\d\d|didn't match GitHub's checksum/.test(err.message)) throw err; await new Promise((r) => setTimeout(r, 60000)); } }
      if (sig) { flagged++; console.log(`  FLAGGED ${t.repo} ${t.asset.name}: ${sig}`); }
    }
    catch (err) { failed++; console.log(`  could not scan ${t.repo} ${t.asset.name}: ${err.message}`); }
    finally { inUse -= need; }
    if (++done % 10 === 0 || !queue.length) { scans.updatedAt = new Date().toISOString(); writeJSON(SCANS, scans); console.log(`${done}/${todo.size} scanned`); }
  }
}));
scans.updatedAt = new Date().toISOString(); writeJSON(SCANS, scans);

// 4. Results onto the published plans: clean files get their fingerprint, flagged ones are blocked.
// Re-read plans.json: it may have changed while this ran (follow.mjs, ccplans import). Results go onto the current file.
const fresh = readJSON(PLANS, plans);
const marked = applyScans(fresh, scans, readJSON(REVIEWED, {})); fresh.updatedAt = new Date().toISOString(); writeJSON(PLANS, fresh, false);
console.log(`scan: ${done - failed} scanned, ${flagged} flagged, ${failed} could not be scanned; ${marked} published downloads carry a result`);
process.exit(0);
