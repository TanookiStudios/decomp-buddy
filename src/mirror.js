// Decomp Buddy's own copy of each download (scripts/mirror.mjs keeps it; the ledger is public/decomp-buddy/mirror.json).
// The app and the website only ever point at a file the ledger lists: files.decompbuddy.com caches a miss for hours.
import { releaseBuilds } from "./scan.js";
import { DOMAIN } from "./forges.js";

export const FILES = "https://files.decompbuddy.com";
export const fileUrl = (sha256, name) => `${FILES}/${sha256}/${encodeURIComponent(name)}`;

/** Marks every build (and the version before it) that we hold a copy of, and each project's saved source zip. */
export function applyMirror(plans, ledger) {
  const files = ledger?.files || {}, other = ledger?.other || {};
  let held = 0;
  for (const { build } of releaseBuilds(plans)) for (const b of [build, build.previous].filter(Boolean)) {
    const yes = !!(b.scanned?.sha256 && files[b.scanned.sha256]);
    if (yes) { b.mirror = true; held++; } else delete b.mirror;
  }
  const newest = {};
  for (const [key, v] of Object.entries(other)) if (v.kind === "source" && (!newest[v.repo] || v.at > newest[v.repo].at)) newest[v.repo] = { key, at: v.at, tag: v.tag, size: v.size };
  for (const [k, e] of Object.entries(plans.plans || {})) { if (newest[k]) e.source = { url: `${FILES}/${newest[k].key}`, tag: newest[k].tag, size: newest[k].size }; else delete e.source; }
  return held;
}

const safe = (s) => String(s).replace(/[^A-Za-z0-9._@+-]/g, "_");
/** Every project's source zip still to save: [{ planKey, url, key, name, tag }], source-built games first.
 *  Shared by scripts/mirror.mjs (copies via the Worker) and scripts/mirror-runner.mjs (on a GitHub build machine). */
export function sourceJobs(plans, ledger, now = new Date()) {
  const other = ledger?.other || {}, today = now.toISOString().slice(0, 10), enc = encodeURIComponent;
  const sourceBuilt = (e) => Object.values(e.targets || {}).some((t) => (t?.games || []).some((g) => g.build?.method === "source"));
  const keys = Object.keys(plans.plans || {}).sort((a, b) => sourceBuilt(plans.plans[b]) - sourceBuilt(plans.plans[a]));
  const out = [];
  for (const k of keys) {
    const [host, full] = k.split(":"), [owner, repo] = full.split("/"), tag = plans.plans[k].tag;
    if (!DOMAIN[host]) continue;
    const ref = tag || "HEAD", base = `https://${DOMAIN[host]}/${full}`;
    const url = host === "github" ? (tag ? `${base}/archive/refs/tags/${enc(tag)}.zip` : `${base}/archive/HEAD.zip`)
      : host === "gitlab" ? `${base}/-/archive/${enc(ref)}/${enc(repo)}-${enc(ref)}.zip` : `${base}/archive/${enc(ref)}.zip`;
    const key = `source/${host}/${safe(owner)}/${safe(repo)}/${tag ? safe(tag) : `HEAD-${today}`}.zip`;
    // A project with no release is re-saved at most once a month, so its code doesn't go stale.
    if (Object.values(other).some((v) => v.kind === "source" && v.repo === k && (tag ? v.tag === tag : now - Date.parse(v.at) < 30 * 864e5))) continue;
    out.push({ planKey: k, url, key, name: `${repo}-${ref}-source.zip`, tag: tag || null });
  }
  return out;
}
