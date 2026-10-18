// Thunderstore mods, read-only, through its public API (no key). The N64 Recomp games and a few HarbourMasters
// ports keep a community there. A package is a zip (manifest.json, icon.png, README.md beside the mod files) and
// names the packages it needs as "Namespace-Name-1.2.3". Downloads come straight from Thunderstore, checked by size.

export const TS = "https://thunderstore.io";
const UA = { "User-Agent": "DecompBuddy (+https://tanookistudios.com/decomp-buddy)", Accept: "application/json" };

// Which community a repo's mods live in. Every slug checked against https://thunderstore.io/api/experimental/community/
// on 2026-10-18 (there's no Mario Kart 64 Recompiled community; Viva Pinata's is Trouble in Paradise, not our port).
export const COMMUNITIES = {
  "zelda64recomp/zelda64recomp": "zelda-64-recompiled",
  "sonicdcer/starfox64recomp": "starfox-64-recompiled",
  "banjorecomp/banjorecomp": "banjo-recompiled",
  "dinosaurplanetrecomp/dino-recomp": "dinosaur-planet-recompiled",
  "harvestmoon64recomp/harvestmoon64recomp": "harvest-moon-64-recompiled",
  "megaman64recomp/megaman64recompiled": "mega-man-64-recompiled",
  "revosucks/bm64recomp": "bomberman-64-recompiled",
  "harbourmasters/shipwright": "ship-of-harkinian",
  "harbourmasters/2ship2harkinian": "2-ship-2-harkinian",
  "harbourmasters/spaghettikart": "spaghetti-kart",
  "harbourmasters/starship": "starship",
};

// Thunderstore versions are always Major.Minor.Patch.
export const newerVersion = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
export const depRef = (s) => { const m = String(s).match(/^([A-Za-z0-9_]+)-([A-Za-z0-9_]+)-(\d+\.\d+\.\d+)$/); return m ? { namespace: m[1], name: m[2], version: m[3], fullName: `${m[1]}-${m[2]}` } : null; };

// One package as the app shows it, at its newest version (the API lists versions newest first).
export function packageOf(p) {
  const v = p.versions?.[0] || {};
  return {
    namespace: p.owner, name: p.name, fullName: p.full_name || `${p.owner}-${p.name}`, title: String(p.name || "").replace(/_/g, " "), url: p.package_url || `${TS}/package/${p.owner}/${p.name}/`,
    author: p.owner || null, description: v.description || "", icon: v.icon || null, website: v.website_url || "",
    downloads: (p.versions || []).reduce((n, x) => n + (x.downloads || 0), 0), updated: p.date_updated || null,
    deprecated: !!p.is_deprecated, adult: !!p.has_nsfw_content,
    version: v.version_number || null, downloadUrl: v.download_url || null, size: v.file_size || 0, dependencies: v.dependencies || [],
  };
}
export async function fetchPackages(community, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${TS}/c/${encodeURIComponent(community)}/api/v1/package/`, { headers: UA, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Thunderstore answered ${res.status}`);
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error("Thunderstore sent something that isn't a package list.");
  return list.map(packageOf);
}

// Everything a package needs, each once, dependencies before what needs them; the package itself last.
// A dependency that isn't in this game's community is reported, not guessed at (on 2026-10-18 those were mis-tagged packages from other games).
export function withDependencies(pkg, packages) {
  const byName = new Map(packages.map((p) => [p.fullName.toLowerCase(), p]));
  const order = [], missing = [], seen = new Set();
  const visit = (p) => {
    seen.add(p.fullName.toLowerCase());
    for (const d of p.dependencies) {
      const r = depRef(d), key = r?.fullName.toLowerCase(), dep = key && byName.get(key);
      if (key && seen.has(key)) continue;
      if (dep) visit(dep); else { if (key) seen.add(key); missing.push(r ? r.fullName : String(d)); }
    }
    order.push(p);
  };
  visit(pkg);
  return { order, missing };
}

// Search a community's packages: deprecated ones left out, most downloaded first.
export function searchPackages(packages, q = "") {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  return packages.filter((p) => !p.deprecated && words.every((w) => `${p.title} ${p.author} ${p.description}`.toLowerCase().includes(w))).sort((a, b) => b.downloads - a.downloads);
}
