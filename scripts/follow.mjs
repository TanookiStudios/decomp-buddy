#!/usr/bin/env node
// Moves published install steps onto each game's newest release, with the 48-hour hold (admin only).
//   node scripts/follow.mjs --site ~/Documents/GitHub/TanookiStudios-Site [--dry] [--only owner/repo]
// For every published build whose game has a newer stable release:
//   - records it as build.next (so scripts/scan.mjs scans that file);
//   - moves the build onto it once the release is 48 hours old, its uploader is the owner or has uploaded this
//     project's releases before, and the file scanned clean (scans.json / scans-reviewed.json);
//   - lists builds whose new release has no matching file (re-plan them with ccplans) and uploads that need a look.
// Run order for a publish: follow -> scan -> follow -> build-catalog.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { releasesOf, saveReleases } from "./releases-cache.mjs";
import { releaseBuilds, scanKey } from "../src/scan.js";
import { nextStep } from "../src/follow.js";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const site = arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site");
const DIR = path.join(site, "public", "decomp-buddy");
const PLANS = path.join(DIR, "plans.json"), SCANS = path.join(DIR, "scans.json"), REVIEWED = path.join(DIR, "scans-reviewed.json");
const OUT = path.join(os.homedir(), ".decomp-buddy-scan"), dry = process.argv.includes("--dry"), only = arg("--only")?.toLowerCase();
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

const plans = readJSON(PLANS, null); if (!plans) { console.log(`no plans.json at ${PLANS}`); process.exit(1); }
const scans = readJSON(SCANS, { files: {} }), reviewed = readJSON(REVIEWED, {});
// Uploaders a person looked at and cleared for one project ("owner/repo": ["login", ...]) after a "needs a look".
const cleared = readJSON(path.join(DIR, "uploaders-reviewed.json"), {});
const clean = (planKey, b) => { const r = scans.files[scanKey(planKey, b)]; return !!r && (r.clean || !!reviewed[r.sha256]); };

const byRepo = new Map();
for (const b of releaseBuilds(plans)) if (!only || b.planKey.endsWith(`:${only}`)) (byRepo.get(b.planKey) || byRepo.set(b.planKey, []).get(b.planKey)).push(b);
const tally = { current: 0, advanced: 0, waiting: 0, review: 0, replan: 0, unreachable: 0 }, replan = [], review = [];
// Each release gets one re-plan: when the new steps still use an older release (the new one is only a patch or extras),
// the same mismatch would otherwise be listed again every day.
const ASKED = path.join(OUT, "replan-asked.json"), asked = readJSON(ASKED, {});
let i = 0; const keys = [...byRepo.keys()];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < keys.length) {
    const key = keys[i++], [host, full] = key.split(":"), [owner, repo] = full.split("/");
    let releases;
    try { releases = await releasesOf(host, owner, repo); } catch (err) { if (/rate limit/i.test(err.message)) { console.log(err.message); process.exit(1); } tally.unreachable += byRepo.get(key).length; continue; }
    // Everyone who uploaded an older release of this project counts as one of its usual uploaders.
    const knownUploaders = [...new Set([...releases.slice(1).flatMap((r) => r.assets.map((a) => a.uploader)), ...(cleared[full] || [])].filter(Boolean))];
    const collection = new Set(byRepo.get(key).map((b) => b.build.release_tag)).size > 1;
    for (const { build } of byRepo.get(key)) {
      const step = nextStep(build, releases, { owner, knownUploaders, collection });
      if (step.action === "current") { delete build.next; tally.current++; continue; }
      if (step.action === "replan") { delete build.next; const k = `${full}: ${step.why}`; if (asked[k]) { tally.current++; continue; } asked[k] = new Date().toISOString().slice(0, 10); tally.replan++; replan.push(k); continue; }
      build.next = { release_tag: step.release.tag, release_asset: step.asset.name, publishedAt: step.release.publishedAt, uploader: step.asset.uploader || null, ...(build.next?.scanned ? { scanned: build.next.scanned } : {}) };
      if (step.action === "advance" && clean(key, build.next)) {
        const from = build.release_tag;
        build.release_tag = build.next.release_tag; build.release_asset = build.next.release_asset; delete build.next; delete build.scanned;
        plans.plans[key].tag = build.release_tag; tally.advanced++; console.log(`  ${full}: ${from} -> ${build.release_tag}`);
      } else if (step.review) { tally.review++; review.push(`${full}: ${step.why}`); }
      else tally.waiting++;
    }
  }
}));

console.log(`follow: ${tally.current} current, ${tally.advanced} moved to a newer release, ${tally.waiting} waiting (hold or scan), ${tally.review} need a look, ${tally.replan} need new steps${tally.unreachable ? `, ${tally.unreachable} skipped (GitHub didn't answer)` : ""}`);
fs.mkdirSync(OUT, { recursive: true });
if (!only) {
fs.writeFileSync(path.join(OUT, "follow-replan.txt"), replan.join("\n") + (replan.length ? "\n" : ""));
fs.writeFileSync(ASKED, JSON.stringify(asked, null, 1));
fs.writeFileSync(path.join(OUT, "follow-review.txt"), review.join("\n") + (review.length ? "\n" : ""));
if (replan.length || review.length) console.log(`lists: ${path.join(OUT, "follow-replan.txt")}, ${path.join(OUT, "follow-review.txt")}`);
}
saveReleases();
if (!dry) { plans.updatedAt = new Date().toISOString(); const t = `${PLANS}.tmp`; fs.writeFileSync(t, JSON.stringify(plans)); fs.renameSync(t, PLANS); }
