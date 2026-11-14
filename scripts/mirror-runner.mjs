#!/usr/bin/env node
// Runs on a GitHub build machine (.github/workflows/mirror-source.yml): downloads each project's source zip that our
// storage doesn't have yet and hands it to the decomp-mirror Worker with its size known, which R2 streams straight in.
// Big zips can't be pieced together inside the Worker's CPU limit, and this keeps them off Maddie's connection.
// The admin Mac's next `scripts/mirror.mjs --source` finds them already stored and records them in the ledger.
//   MIRROR_TOKEN=... node scripts/mirror-runner.mjs [--limit N]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { sourceJobs } from "../src/mirror.js";

const WORKER = "https://decomp-mirror.kirbymail.workers.dev", token = process.env.MIRROR_TOKEN;
if (!token) { console.log("no MIRROR_TOKEN"); process.exit(1); }
const get = async (u) => (await fetch(u, { headers: { "user-agent": "decomp-buddy-mirror" } })).json();
const plans = await get("https://tanookistudios.com/decomp-buddy/plans.json"), ledger = await get("https://tanookistudios.com/decomp-buddy/mirror.json").catch(() => ({}));
const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || Infinity;
const jobs = sourceJobs(plans, ledger).slice(0, limit), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "src-"));
console.log(`${jobs.length} source zip(s) to save`);
// The Worker takes at most 100 MB per upload, so bigger zips go up in 64 MB pieces (R2 joins them).
const PIECE = 64 * 1024 * 1024;
const q = (j, more = {}) => new URLSearchParams({ key: j.key, name: j.name, ...more }).toString();
const call = (method, p, file = null, body = null) => JSON.parse(execFileSync("curl", ["-sS", "--retry", "3", "-X", method, "-H", `authorization: Bearer ${token}`, ...(file ? ["-T", file] : []), ...(body ? ["-H", "content-type: application/json", "--data-binary", body] : []), `${WORKER}${p}`], { encoding: "utf8", timeout: 30 * 60e3 }));
async function inPieces(j, f) {
  const start = call("POST", `/mpu?${q(j)}`); if (!start.ok || start.existed) return start;
  const dir = `${f}.parts`; fs.mkdirSync(dir, { recursive: true });
  try {
    execFileSync("split", ["-b", String(PIECE), f, `${dir}/p`]);
    const parts = [];
    for (const [n, p] of fs.readdirSync(dir).sort().entries()) { const r = call("PUT", `/mpu?${q(j, { uploadId: start.uploadId, n: String(n + 1) })}`, path.join(dir, p)); if (!r.ok) throw new Error(r.error); parts.push(r.part); }
    return call("POST", `/mpu/done?${q(j, { uploadId: start.uploadId })}`, null, JSON.stringify({ parts }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
let i = 0, ok = 0, bad = 0, bytes = 0;
await Promise.all(Array.from({ length: 4 }, async (_, w) => {
  while (i < jobs.length) {
    const j = jobs[i++], f = path.join(tmp, `${w}.zip`);
    try {
      execFileSync("curl", ["-sfL", "--retry", "3", "-o", f, j.url], { stdio: "ignore", timeout: 30 * 60e3 });
      const r = fs.statSync(f).size <= PIECE ? call("PUT", `/put?${q(j)}`, f) : await inPieces(j, f);
      if (!r.ok) throw new Error(r.error); ok++; bytes += r.size || 0;
    } catch (err) { bad++; console.log(`  ${j.planKey}: ${String(err.message).split("\n")[0].slice(0, 120)}`); }
    finally { fs.rmSync(f, { force: true }); }
    if ((ok + bad) % 100 === 0) console.log(`  ${ok + bad}/${jobs.length}: ${ok} saved (${(bytes / 1e9).toFixed(1)} GB), ${bad} failed`);
  }
}));
console.log(`saved ${ok} (${(bytes / 1e9).toFixed(1)} GB), ${bad} failed`);
