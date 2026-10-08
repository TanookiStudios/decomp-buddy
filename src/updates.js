// "A newer version is available" - reads a small JSON feed Maddie publishes:
// { "version": "0.12.0", "notes": "...", "downloads": { "macos-arm64": url, "macos-x64": url, "windows": url, "linux": url } }

export const UPDATE_URL = "https://tanookistudios.com/decomp-buddy/latest.json";

const parts = (v) => String(v).replace(/^v/, "").split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : 0));
export function isNewer(candidate, current) {
  const a = parts(candidate), b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d > 0; }
  return false;
}

export async function checkForUpdate(currentVersion, { url = UPDATE_URL, target = "windows" } = {}) {
  const res = await fetch(url, { headers: { "User-Agent": `decomp-buddy/${currentVersion}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`Update feed answered ${res.status}`);
  const feed = await res.json();
  if (!feed.version) throw new Error("Update feed has no version");
  const available = isNewer(feed.version, currentVersion);
  return { available, version: feed.version, current: currentVersion, notes: feed.notes || "", url: feed.downloads?.[target] || feed.url || "" };
}
