// Release lists shared by scripts/follow.mjs and scripts/scan.mjs for an hour, so one publish run reads each
// repo's releases from GitHub once instead of twice (the REST limit is 5,000 an hour).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hostOf } from "../src/hosts.js";

const FILE = path.join(os.homedir(), ".decomp-buddy-scan", "releases-cache.json"), HOUR = 3600e3;
let mem = null, dirty = false;
const load = () => { if (!mem) { try { mem = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { mem = {}; } } return mem; };
export async function releasesOf(host, owner, repo) {
  const c = load(), k = `${host}:${owner}/${repo}`.toLowerCase(), hit = c[k];
  if (hit && Date.now() - hit.at < HOUR) return hit.releases;
  const releases = await hostOf(host).releases({ owner, repo });
  c[k] = { at: Date.now(), releases }; dirty = true;
  return releases;
}
export function saveReleases() {
  if (!dirty) return;
  const now = Date.now(); for (const [k, v] of Object.entries(mem)) if (now - v.at > HOUR) delete mem[k];
  fs.mkdirSync(path.dirname(FILE), { recursive: true }); const t = `${FILE}.tmp`; fs.writeFileSync(t, JSON.stringify(mem)); fs.renameSync(t, FILE); dirty = false;
}
