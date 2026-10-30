#!/usr/bin/env node
// Best Version For You (src/bestversion.js): reads player reports per version from the site's database and, where
// the newest published version mostly doesn't start but the one before ran well, puts the install steps back on that
// one. scripts/follow.mjs then won't move forward to the bad version again; a newer release clears it.
//   node scripts/bestversion.mjs --site ~/Documents/GitHub/TanookiStudios-Site [--dry]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { releaseBuilds } from "../src/scan.js";
import { shouldRollBack } from "../src/bestversion.js";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const site = arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site"), dry = process.argv.includes("--dry");
const PLANS = path.join(site, "public", "decomp-buddy", "plans.json");
let rows;
try {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "tanooki-site", "--remote", "--json", "--command",
    "SELECT game, tag, SUM(verdict = 'runs') runs, SUM(verdict = 'issues') issues, SUM(verdict = 'no') no FROM decomp_reports WHERE tag IS NOT NULL AND verdict IS NOT NULL GROUP BY game, tag"],
    { cwd: site, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  rows = JSON.parse(out)[0].results;
} catch (err) { console.log(`bestversion: couldn't read player reports (${String(err.message).split("\n")[0]}) - skipped`); process.exit(0); }

const counts = {}; // plan key -> tag -> { runs, issues, no } (a collection's games share their repo's versions)
for (const r of rows) { const k = String(r.game).split("#")[0].toLowerCase(), t = ((counts[k] ||= {})[r.tag] ||= { runs: 0, issues: 0, no: 0 }); t.runs += r.runs || 0; t.issues += r.issues || 0; t.no += r.no || 0; }

const plans = JSON.parse(fs.readFileSync(PLANS, "utf8"));
let back = 0;
for (const { planKey, build } of releaseBuilds(plans)) {
  const c = counts[planKey.toLowerCase()], prev = build.previous;
  if (!c || !prev || !shouldRollBack(c, build.release_tag, prev.release_tag)) continue;
  const bad = { release_tag: build.release_tag, release_asset: build.release_asset, scanned: build.scanned };
  Object.assign(build, { release_tag: prev.release_tag, release_asset: prev.release_asset, scanned: prev.scanned }); build.previous = bad;
  const t = c[bad.release_tag], e = plans.plans[planKey];
  e.recommended = { tag: prev.release_tag, badTag: bad.release_tag, no: t.no, total: t.runs + t.issues + t.no }; e.tag = prev.release_tag;
  back++; console.log(`  ${planKey}: ${bad.release_tag} -> back to ${prev.release_tag} (${t.no} of ${e.recommended.total} players say it doesn't start)`);
}
if (back && !dry) { const t = `${PLANS}.tmp`; fs.writeFileSync(t, JSON.stringify(plans)); fs.renameSync(t, PLANS); }
console.log(`bestversion: ${Object.keys(counts).length} game(s) with reports, ${back} put back on their last good version`);
