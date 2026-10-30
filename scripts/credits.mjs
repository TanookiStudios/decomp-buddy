#!/usr/bin/env node
// Credits: the people who made each GitHub project (its top 12 contributors; bots left out), for the "Made By" row in
// the app and on the website. Into plans.json entries as `credits: { at, people: [{ login, avatar, n }] }`; each repo
// re-checked weekly. Needs GITHUB_TOKEN. GitLab/Codeberg contributor lists carry email addresses, so they're skipped.
//   node scripts/credits.mjs --site ~/Documents/GitHub/TanookiStudios-Site [--all]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { people } from "../src/credits.js";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const site = arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site");
const PLANS = path.join(site, "public", "decomp-buddy", "plans.json");
const token = process.env.GITHUB_TOKEN; if (!token) { console.log("credits: no GITHUB_TOKEN - skipped"); process.exit(0); }
const plans = JSON.parse(fs.readFileSync(PLANS, "utf8")), week = Date.now() - 7 * 864e5, all = process.argv.includes("--all");
const due = Object.keys(plans.plans).filter((k) => k.startsWith("github:") && (all || !(Date.parse(plans.plans[k].credits?.at) > week)));

let i = 0, done = 0, failed = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < due.length) {
    const k = due[i++], [owner, repo] = k.slice(7).split("/");
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=15`, { headers: { Authorization: `Bearer ${token}`, "User-Agent": "decomp-buddy", Accept: "application/vnd.github+json" } }).catch(() => null);
    if (res?.status === 204 || res?.status === 404) { plans.plans[k].credits = { at: new Date().toISOString(), people: [] }; done++; continue; } // empty or gone
    if (!res?.ok) { failed++; if (res?.status === 403 || res?.status === 429) { console.log("credits: GitHub rate limit - stopping, next run continues"); i = due.length; } continue; }
    plans.plans[k].credits = { at: new Date().toISOString(), people: people(await res.json()) }; done++;
  }
}));
const t = `${PLANS}.tmp`; fs.writeFileSync(t, JSON.stringify(plans)); fs.renameSync(t, PLANS);
console.log(`credits: ${done} checked, ${Object.keys(plans.plans).length - due.length} still fresh${failed ? `, ${failed} skipped (next run tries again)` : ""}`);
