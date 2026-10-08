// Export / Import Setup: one JSON file to move to a new computer (or keep as a backup).
// Keys never leave: they're encrypted to this machine anyway, and a file you hand around shouldn't carry them.

export const KIND = "decomp-buddy-setup";
// deviceId, syncDir and voterId belong to this computer: a copy on another one would confuse save sync.
const SECRET = new Set(["providers", "github", "window", "lastVersion", "discovered", "deviceId", "syncDir", "voterId"]);

export function buildExport(settings, { version, library = [], vault = [] } = {}) {
  const s = Object.fromEntries(Object.entries(settings).filter(([k]) => !SECRET.has(k)));
  // Keep the provider choice and model, drop the keys.
  s.providers = Object.fromEntries(Object.entries(settings.providers || {}).map(([id, p]) => [id, { model: p.model, baseUrl: p.baseUrl }]));
  return { kind: KIND, version, exportedAt: new Date().toISOString(), settings: s, library, vault };
}

const byKey = (list, key) => { const m = new Map(); for (const x of list || []) m.set(key(x), x); return m; };

// Merge, never overwrite: what's here stays; lists gain what's missing; preferences are only
// filled in where this computer has none.
export function mergeImport(current, file) {
  if (file?.kind !== KIND) throw new Error("That isn't a Decomp Buddy setup file.");
  const inc = file.settings || {}, out = structuredClone(current), added = {};
  const mergeList = (name, key) => {
    const have = byKey(out[name], key); let n = 0;
    for (const x of inc[name] || []) if (!have.has(key(x))) { have.set(key(x), x); n++; }
    out[name] = [...have.values()]; if (n) added[name] = n;
  };
  mergeList("localFinds", (x) => String(x.repo).toLowerCase());
  mergeList("pendingSharedSources", (x) => `${x.type}:${String(x.value).toLowerCase()}`);
  mergeList("libraryFolders", (x) => x);
  for (const name of ["wishlist", "discoverDismissed", "deadRepos", "mine"]) {
    const before = Object.keys(out[name] || {}).length;
    out[name] = { ...(inc[name] || {}), ...(out[name] || {}) };
    const n = Object.keys(out[name]).length - before; if (n) added[name] = n;
  }
  if (inc.sources?.custom?.length) { const have = byKey(out.sources?.custom, (c) => `${c.type}:${c.value}`); let n = 0; for (const c of inc.sources.custom) if (!have.has(`${c.type}:${c.value}`)) { have.set(`${c.type}:${c.value}`, c); n++; } out.sources = { ...(out.sources || {}), custom: [...have.values()] }; if (n) added.customSources = n; }
  const filled = [];
  for (const [k, v] of Object.entries(inc)) if (out[k] === undefined && !["providers", "sources"].includes(k) && typeof v !== "object") { out[k] = v; filled.push(k); }
  for (const [id, p] of Object.entries(inc.providers || {})) { out.providers ||= {}; if (!out.providers[id]) out.providers[id] = { model: p.model, baseUrl: p.baseUrl }; }
  return { settings: out, added, filled, library: file.library || [] };
}
