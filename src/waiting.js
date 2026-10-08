// Waiting For A Port: decomps nobody can play yet. Most rebuild the original cartridge or disc
// (byte for byte), so building one gets you the game you already had - they're kept out of the
// catalog, listed on their own, and move into Individual Finds by themselves the day the project
// publishes a Windows, Mac or Linux download.
//   waiting.json: { "updatedAt": iso, "games": [{ "repo": "owner/name", "title", "console", "notes", "website", "addedAt", "via" }],
//                   "hidden": [{ "repo", "title", "reason" }] }   <- not a PC game at all (lists, mods, phone ports): never shown, never promoted
import fs from "node:fs";
import path from "node:path";
import { enrichFromGitHub, publishFinds, repoKey } from "./sources/finds.js";

export const WAITING_URL = "https://tanookistudios.com/decomp-buddy/waiting.json";
const DESKTOP = new Set(["Windows", "macOS", "Linux"]);

export const waitingFileNextTo = (findsFile) => (findsFile ? path.join(path.dirname(findsFile), "waiting.json") : "");

export function readWaiting(file) {
  try { const doc = JSON.parse(fs.readFileSync(file, "utf8")); return Array.isArray(doc.games) ? doc : { games: [] }; } catch { return { games: [] }; }
}

// Every repo the catalog must not show: waiting decomps and hidden non-games, from any source.
export const excludedKeys = (doc) => new Set([...(doc.games || []), ...(doc.hidden || [])].filter((g) => g.repo).map((g) => (repoKey(g.repo) || "").toLowerCase()).filter(Boolean));
export const waitingKeys = (file) => excludedKeys(readWaiting(file));
// Hidden entries can also name a catalog id ("project:nelumbo") for cards that have no repository at all.
export const excludedIds = (doc) => new Set((doc?.hidden || []).map((h) => String(h.id || "").toLowerCase()).filter(Boolean));
export const withoutExcluded = (games, doc) => {
  const out = excludedKeys(doc || {}), ids = excludedIds(doc);
  if (!out.size && !ids.size) return games;
  return games.filter((g) => !ids.has(String(g.id || "").toLowerCase()) && (!g.owner || !out.has(`${g.owner}/${g.repo}`.toLowerCase())));
};

// Ask GitHub about every waiting project; any with a desktop download moves into finds.json.
// Needs GITHUB_TOKEN (two calls per project). Returns the repos that moved.
export async function promoteReady({ findsFile, log = console.log, check = enrichFromGitHub }) {
  const file = waitingFileNextTo(findsFile);
  const doc = readWaiting(file);
  if (!doc.games.length) return [];
  if (!process.env.GITHUB_TOKEN) { log(`waiting: skipped checking ${doc.games.length} project(s) for new downloads - no GITHUB_TOKEN`); return []; }
  const moved = [], stay = [];
  let i = 0, failed = 0;
  async function worker() {
    while (i < doc.games.length) {
      const g = doc.games[i++];
      try {
        const info = await check(repoKey(g.repo));
        if (info.exists && info.platforms.some((p) => DESKTOP.has(p))) moved.push({ ...g, repo: info.repo, platforms: info.platforms, version: info.version, status: info.status, updatedAt: info.updatedAt, notes: info.notes || g.notes, website: info.website || g.website, via: `${g.via || "Waiting"} → released` });
        else stay.push(g);
      } catch (err) { failed++; stay.push(g); if (/rate limit/.test(err.message)) { const rest = doc.games.slice(i); stay.push(...rest); failed += rest.length; i = doc.games.length; } }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  if (moved.length) {
    publishFinds(findsFile, moved);
    stay.sort((a, b) => a.title.localeCompare(b.title));
    const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify({ ...doc, updatedAt: new Date().toISOString(), games: stay }, null, 2) + "\n"); fs.renameSync(tmp, file);
  }
  log(`waiting: ${moved.length} of ${doc.games.length} now have a download and moved to the catalog${moved.length ? `: ${moved.map((g) => g.title).join(", ")}` : ""}${failed ? ` (${failed} couldn't be checked)` : ""}`);
  return moved.map((g) => g.repo);
}
