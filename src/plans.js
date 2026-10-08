// Published plans: the AI's answer for a repo, generated once by the admin and handed to
// everyone. plans.json: { updatedAt, plans: { "<host>:<owner>/<repo>": { tag, targets: { windows: <analysis>, "macos-arm64": ..., linux: ... }, generatedAt } } }
// Read order: the admin's file on disk, the live feed (cached a day), the copy bundled with the app.

import { canonOwner } from "./renames.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PLANS_URL = "https://tanookistudios.com/decomp-buddy/plans.json";
const BUNDLED = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plans.json");
const DAY = 24 * 3600 * 1000;

export const planKey = (host, owner, repo) => `${host || "github"}:${canonOwner(owner, repo)}/${repo}`.toLowerCase();

export function readBundled() { try { return JSON.parse(fs.readFileSync(BUNDLED, "utf8")); } catch { return { plans: {} }; } }

export async function fetchPublished({ file, cacheDir } = {}) {
  if (file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch {} }
  const cache = cacheDir && path.join(cacheDir, "plans-cache.json");
  try { if (cache && Date.now() - fs.statSync(cache).mtimeMs < DAY) return JSON.parse(fs.readFileSync(cache, "utf8")); } catch {}
  try {
    const res = await fetch(PLANS_URL, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (res.ok) { const data = await res.json(); if (cache) { try { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cache, JSON.stringify(data)); } catch {} } return data; }
  } catch {}
  try { if (cache) return JSON.parse(fs.readFileSync(cache, "utf8")); } catch {}
  return readBundled();
}

// The stored analysis for this repo+target, or null. Mac Intel falls back to the Apple Silicon plan (same asset names in practice).
export function lookupPlan(published, key, target) {
  const e = published?.plans?.[key];
  if (!e) return null;
  const t = e.targets?.[target] || (target === "macos-x64" ? e.targets?.["macos-arm64"] : null);
  return t ? { analysis: structuredClone(t), tag: e.tag, generatedAt: e.generatedAt } : null;
}

export function writePlans(file, entries) {
  let data = { plans: {} };
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  data.plans ||= {};
  for (const [key, e] of Object.entries(entries)) data.plans[key] = { ...(data.plans[key] || {}), ...e, targets: { ...(data.plans[key]?.targets || {}), ...(e.targets || {}) } };
  data.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write-then-rename: a reader (or a second writer) never sees half a file.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
  return data;
}

export const TARGET_OF_PLATFORM = { Windows: ["windows"], macOS: ["macos-arm64"], Linux: ["linux"] };
