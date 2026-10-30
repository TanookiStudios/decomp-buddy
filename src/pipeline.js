// Where every game is in the publish process, from the files the process already writes. One answer for the admin
// page, the public status pages and the emails to people who submitted a game (status.json, written by the catalog build).
//   Found -> Initial Check -> Safety Check -> Install Instructions -> Virus And Malware Scan -> Box Art -> Live
// A game is live once it's in catalog.json. Box art never blocks: a missing cover is "skipped", not "waiting".
import { planKey } from "./plans.js";
import { releaseBuilds } from "./scan.js";

export const STEPS = [["found", "Found"], ["check", "Initial Check"], ["safety", "Safety Check"], ["steps", "Install Instructions"],
  ["scan", "Virus And Malware Scan"], ["art", "Box Art"], ["live", "Live"]];
// state of a step: done | now | todo | failed | skipped
const ladder = (upTo, last = "now", notes = {}) => {
  const i = STEPS.findIndex(([id]) => id === upTo);
  return STEPS.map(([id, label], n) => ({ id, label, state: n < i ? "done" : n === i ? last : "todo", ...(notes[id] ? { note: notes[id] } : {}) }));
};
const keyOf = (g) => `${g.host || "github"}:${g.repo || ""}`.toLowerCase();
const HELD = /^held for safety/i;

export function pipelineStatus({ catalog, waiting, plans, blocked = [], queued = [] }) {
  const games = [], seen = new Set();
  const entryOf = (g) => { const [owner, repo] = String(g.repo || "").split("/"); return plans?.plans?.[planKey(g.host || "github", owner, repo)]; };
  for (const g of catalog?.games || []) {
    const k = keyOf(g); if (seen.has(`${k}#${g.slug}`)) continue; seen.add(`${k}#${g.slug}`);
    const e = entryOf(g), builds = e ? releaseBuilds({ plans: { x: e } }) : [];
    const scan = !e ? { state: "todo" } : g.scan?.flagged ? { state: "failed", note: "A download was flagged by the malware scan" }
      : g.scan ? { state: "done" } : builds.length ? { state: "now", note: "Waiting for its scan" } : { state: "skipped", note: "Builds from source: no download to scan" };
    const steps = STEPS.map(([id, label]) => ({ id, label, state: "done" }));
    const set = (id, v) => Object.assign(steps.find((s) => s.id === id), v);
    if (!g.plan) set("steps", { state: "now", note: "Writing install steps" });
    set("scan", scan);
    if (!g.boxartUrl) set("art", { state: "skipped", note: "No cover found" });
    // The newest release on its way: scanned, then live; a stranger's upload waits for a look.
    const next = builds.map((b) => b.build.next).find(Boolean);
    games.push({ key: k, repo: g.repo, title: g.title, console: g.console, slug: g.slug, version: g.version || null, outcome: "live",
      stage: steps.find((s) => s.state === "now" || s.state === "failed")?.id || "live", steps,
      ...(next ? { next: { version: next.release_tag, stage: next.scanned?.flagged ? "failed" : "scan", note: next.scanned?.flagged ? "Flagged by the malware scan" : "Waiting for its scan" } } : {}) });
  }
  for (const g of waiting?.games || []) {
    games.push({ key: keyOf(g), repo: g.repo, title: g.title, console: g.console || null, version: null, outcome: "coming-soon", stage: "check",
      steps: ladder("check", "now", { check: "No playable download yet - it moves up when one appears" }), reason: g.notes || null });
  }
  for (const g of waiting?.hidden || []) {
    const held = HELD.test(g.reason || ""), removed = /^removed by maddie/i.test(g.reason || "");
    games.push({ key: keyOf(g), repo: g.repo, title: g.title || g.repo, console: g.console || null, version: null,
      outcome: removed ? "removed" : held ? "held" : "not-listed", stage: held ? "safety" : "check", reason: g.reason || null,
      steps: ladder(held ? "safety" : "check", "failed", { [held ? "safety" : "check"]: g.reason || "Not listed" }) });
  }
  // In the process now: listed once install steps exist and every download is scanned (the Addition Queue).
  for (const g of queued) {
    const stage = g.plan ? "scan" : "steps";
    games.push({ key: keyOf(g), repo: g.repo, host: g.host || "github", platforms: g.platforms || [], title: g.title, console: g.console || null, slug: g.slug, version: g.version || null, outcome: "queued", stage,
      steps: ladder(stage, "now", { [stage]: stage === "steps" ? "Writing install steps" : "Waiting for its scan" }) });
  }
  // Flagged by the malware scan: kept out of the catalog until the file is looked at and cleared.
  for (const g of blocked) games.push({ key: keyOf(g), repo: g.repo, title: g.title, console: g.console || null, version: g.version || null, outcome: "blocked", stage: "scan",
    reason: "A download was flagged by the malware scan", steps: ladder("scan", "failed", { scan: "A download was flagged by the malware scan" }) });
  const counts = {};
  for (const g of games) {
    const bucket = g.outcome === "live" ? (g.stage === "live" ? "live" : `live-${g.stage}`) : g.outcome === "queued" ? `queued-${g.stage}` : g.outcome;
    counts[bucket] = (counts[bucket] || 0) + 1;
    if (g.outcome === "live" && g.steps.find((s) => s.id === "art").state === "skipped") counts["no-cover"] = (counts["no-cover"] || 0) + 1;
    if (g.next) counts[`update-${g.next.stage}`] = (counts[`update-${g.next.stage}`] || 0) + 1;
  }
  return { updatedAt: new Date().toISOString(), counts, games };
}
