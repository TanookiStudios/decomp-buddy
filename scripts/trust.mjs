#!/usr/bin/env node
// Safety Report facts for every GitHub project in plans.json: its license and when its owner's account was made
// (src/trust.js). One GitHub GraphQL call per 40 repos; each repo is re-checked weekly. Needs GITHUB_TOKEN.
//   node scripts/trust.mjs --site ~/Documents/GitHub/TanookiStudios-Site [--all]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const site = arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site");
const PLANS = path.join(site, "public", "decomp-buddy", "plans.json");
const token = process.env.GITHUB_TOKEN; if (!token) { console.log("trust: no GITHUB_TOKEN - skipped"); process.exit(0); }
const plans = JSON.parse(fs.readFileSync(PLANS, "utf8"));
const week = Date.now() - 7 * 864e5, all = process.argv.includes("--all");
const due = Object.keys(plans.plans).filter((k) => k.startsWith("github:") && (all || !(Date.parse(plans.plans[k].trust?.checkedAt) > week)));

const q = (batch) => `query { ${batch.map((k, i) => { const [owner, name] = k.slice(7).split("/"); return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { licenseInfo { spdxId name } owner { __typename ... on User { createdAt } ... on Organization { createdAt } } }`; }).join(" ")} }`;
let done = 0, failed = 0;
for (let i = 0; i < due.length; i += 40) {
  const batch = due.slice(i, i + 40);
  const res = await fetch("https://api.github.com/graphql", { method: "POST", headers: { Authorization: `Bearer ${token}`, "User-Agent": "decomp-buddy", "Content-Type": "application/json" }, body: JSON.stringify({ query: q(batch) }) }).catch(() => null);
  const body = res?.ok ? await res.json().catch(() => null) : null;
  if (!body?.data) { failed += batch.length; continue; } // a missing repo is a null entry, not a failed batch
  batch.forEach((k, j) => {
    const r = body.data[`r${j}`]; if (!r) return;
    const lic = r.licenseInfo && r.licenseInfo.spdxId !== "NOASSERTION" ? r.licenseInfo.name : null;
    plans.plans[k].trust = { ...plans.plans[k].trust, license: lic, ownerSince: r.owner?.createdAt || null, ownerIsOrg: r.owner?.__typename === "Organization", checkedAt: new Date().toISOString() };
    done++;
  });
}
const t = `${PLANS}.tmp`; fs.writeFileSync(t, JSON.stringify(plans)); fs.renameSync(t, PLANS);
console.log(`trust: ${done} checked, ${Object.keys(plans.plans).length - due.length} still fresh${failed ? `, ${failed} skipped (GitHub didn't answer - next run tries again)` : ""}`);
