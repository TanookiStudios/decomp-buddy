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

// News banner: a short message Maddie can change on the site without shipping an app update.
// news.json: { items: [{ id, text, url?, until?, minVersion?, maxVersion? }] } - newest first; the app shows the first one that applies.
export const NEWS_URL = "https://tanookistudios.com/decomp-buddy/news.json";
export function pickNews(doc, { version, now = Date.now(), dismissed = [] } = {}) {
  const older = (a, b) => isNewer(b, a);
  for (const n of doc?.items || []) {
    if (!n?.id || !n.text || dismissed.includes(n.id)) continue;
    if (n.until && Date.parse(n.until) < now) continue;
    if (n.minVersion && older(version, n.minVersion)) continue;
    if (n.maxVersion && older(n.maxVersion, version)) continue;
    return { id: String(n.id).slice(0, 60), text: String(n.text).slice(0, 300), url: /^https:\/\//.test(n.url || "") ? n.url : null };
  }
  return null;
}

// Installed games with a real update: the version Decomp Buddy installs now (catalog `version`, the published one)
// differs from the one in the folder, and you haven't skipped that version. `auto` = install it without asking:
// the game's own switch (manifest autoUpdate true/false), else the Settings default.
// installed: [{ folder, manifest }]; games: catalog games. Collections match by their game title.
export function updatesFor(installed, games, { autoDefault = false } = {}) {
  const byRepo = new Map();
  for (const g of games || []) if (g.owner) { const k = `${g.owner}/${g.repo}`.toLowerCase(); byRepo.set(k, [...(byRepo.get(k) || []), g]); }
  const out = [];
  for (const { folder, manifest: m } of installed || []) {
    const cands = byRepo.get(String(m.repo || "").toLowerCase()) || [];
    const g = cands.length > 1 ? cands.find((c) => c.gameTitle === m.plan?.game_title) : cands[0];
    const have = m.release?.tag;
    if (!g?.version || !have || g.version === have || m.skipTag === g.version) continue;
    out.push({ folder, title: m.displayName || m.plan?.game_title || m.folder, from: have, to: g.version, repoUrl: g.repoUrl || m.repoUrl, target: m.target || "windows", auto: m.autoUpdate ?? autoDefault, scanned: !!g.scan?.at });
  }
  return out;
}
