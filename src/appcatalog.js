// The finished catalog the nightly build publishes (app-catalog.json, src/publiccatalog.js): every game with its
// covers, facts and install-step summary already worked out. The app downloads this one file, keeps the last good
// copy, and ships a copy inside itself - so Browse opens at once, offline included, on a computer that has never
// been online. Nov 2026: rebuilding the catalog on each computer took 5-10 minutes and spent GitHub's lookups.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_CATALOG_URL = "https://tanookistudios.com/decomp-buddy/app-catalog.json";
export const BUNDLED_APP_CATALOG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app-catalog.json");
const SAVED = "app-catalog.json";

const read = (f) => { try { const d = JSON.parse(fs.readFileSync(f, "utf8")); return Array.isArray(d?.games) && d.games.length ? d : null; } catch { return null; } };

// Never the network: the admin's own site file, else the newer of the copy saved last time and the copy this
// version shipped with (an old saved copy can be older than a freshly installed app's own).
export function savedAppCatalog({ cacheDir, file = "", bundled = BUNDLED_APP_CATALOG } = {}) {
  const own = file && read(file); if (own) return { ...own, from: "site" };
  const copies = [[read(path.join(cacheDir, SAVED)), "saved"], [read(bundled), "built-in"]].filter(([d]) => d);
  copies.sort(([a], [b]) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
  return copies.length ? { ...copies[0][0], from: copies[0][1] } : null;
}

// The newest copy from the website, saved for next time. Throws on no answer within `timeout` (callers then keep
// showing the saved copy - a slow connection must never freeze Browse).
export async function fetchAppCatalog({ cacheDir, file = "", timeout = 30_000, fetchFn = fetch } = {}) {
  const own = file && read(file); if (own) return { ...own, from: "site" };
  const res = await fetchFn(APP_CATALOG_URL, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(timeout), cache: "no-store" });
  if (!res.ok) throw new Error(`The catalog didn't load (HTTP ${res.status}).`);
  const d = await res.json();
  if (!Array.isArray(d?.games) || !d.games.length) throw new Error("The catalog came back empty.");
  fs.mkdirSync(cacheDir, { recursive: true });
  const f = path.join(cacheDir, SAVED); fs.writeFileSync(`${f}.tmp`, JSON.stringify(d)); fs.renameSync(`${f}.tmp`, f);
  return { ...d, from: "fresh" };
}
