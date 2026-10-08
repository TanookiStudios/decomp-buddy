// Managed source list: sources the admin publishes so every copy of the app scans them.
// sources.json: { "updatedAt": iso, "sources": [{ "type": "github-user"|"list", "value": "Owner" | "https://…", "label": "…" }] }
// Live feed first, bundled copy as the offline fallback.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCES_URL = "https://tanookistudios.com/decomp-buddy/sources.json";
const BUNDLED = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "sources.json");

export const sourceKey = (s) => `${s.type === "list" ? "list" : "github-user"}:${String(s.value || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "").toLowerCase()}`;

const clean = (list) => (Array.isArray(list) ? list : []).filter((s) => s && s.value).map((s) => ({ type: s.type === "list" ? "list" : "github-user", value: String(s.value).trim(), label: s.label || "" }));

export function readBundled() {
  try { return clean(JSON.parse(fs.readFileSync(BUNDLED, "utf8")).sources); } catch { return []; }
}

// Order: the admin's published file on disk, the live feed, the bundled copy.
export async function fetchSharedSources({ file } = {}) {
  if (file) { try { return clean(JSON.parse(fs.readFileSync(file, "utf8")).sources); } catch {} }
  try {
    const res = await fetch(SOURCES_URL, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (res.ok) return clean((await res.json()).sources);
  } catch {}
  return readBundled();
}

// Merge pending sources into sources.json (dedup by type+value) and write it.
export function publishSources(file, pending) {
  let existing = [];
  try { existing = clean(JSON.parse(fs.readFileSync(file, "utf8")).sources); } catch {}
  const byKey = new Map();
  for (const s of [...existing, ...clean(pending)]) byKey.set(sourceKey(s), s);
  const out = { updatedAt: new Date().toISOString(), sources: [...byKey.values()] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  return out;
}

export function removeSource(file, key) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  data.sources = clean(data.sources).filter((s) => sourceKey(s) !== key);
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return data.sources.length;
}

// A source entry must be what its type says. Repo links belong in Individual Finds, not here.
export function validateSourceEntry({ type, value }) {
  const v = String(value || "").trim();
  if (!v) return "Enter a GitHub user/org or a URL.";
  if (type === "list") return /^https?:\/\//i.test(v) ? null : "A page/file source needs a full http(s) URL.";
  const m = v.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)(?:\/([^/\s#?]+))?/i);
  if (/^https?:\/\//i.test(v) && !m) return `${v} isn't a GitHub user or org. For a website, use "Page or file with repo links".`;
  if (m && m[2]) return `${m[1]}/${m[2]} is a repository, not a user. Paste it in the Admin link box to add it as a find, or enter just "${m[1]}" to scan all of that account's repos.`;
  if (!/^[A-Za-z0-9-]+$/.test(m ? m[1] : v)) return `"${v}" isn't a valid GitHub user or org name.`;
  return null;
}
export const normalizeUser = (value) => String(value).trim().replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "").replace(/\/.*$/, "");
