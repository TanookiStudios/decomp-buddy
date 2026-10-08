// "Support This Project": the funding links a repo publishes in FUNDING.yml (GitHub's Sponsor
// button file). Read from raw.githubusercontent.com (no API quota): the repo's .github/, root or
// docs/ folder, then the owner's .github repository - the same order GitHub itself uses.

const HANDLE = {
  github: (u) => `https://github.com/sponsors/${u}`,
  patreon: (u) => `https://www.patreon.com/${u}`,
  open_collective: (u) => `https://opencollective.com/${u}`,
  ko_fi: (u) => `https://ko-fi.com/${u}`,
  tidelift: (u) => `https://tidelift.com/funding/github/${u}`,
  community_bridge: (u) => `https://funding.communitybridge.org/projects/${u}`,
  liberapay: (u) => `https://liberapay.com/${u}`,
  issuehunt: (u) => `https://issuehunt.io/r/${u}`,
  polar: (u) => `https://polar.sh/${u}`,
  buy_me_a_coffee: (u) => `https://buymeacoffee.com/${u}`,
  thanks_dev: (u) => `https://thanks.dev/${u}`,
};
export const LABEL = { github: "GitHub Sponsors", patreon: "Patreon", open_collective: "Open Collective", ko_fi: "Ko-fi", tidelift: "Tidelift", community_bridge: "LFX", liberapay: "Liberapay", issuehunt: "IssueHunt", polar: "Polar", buy_me_a_coffee: "Buy Me A Coffee", thanks_dev: "thanks.dev", custom: "Donate" };

// The handful of YAML shapes FUNDING.yml uses: `key: value`, `key: [a, b]`, and `key:` + `- item` lines.
export function parseFunding(text) {
  const out = {}; let listKey = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").replace(/^#.*$/, "");
    if (!line.trim()) continue;
    const item = line.match(/^\s+-\s*(.+)$/);
    if (item && listKey) { out[listKey].push(unq(item[1])); continue; }
    const kv = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (!kv) { listKey = null; continue; }
    const key = kv[1].toLowerCase(), val = kv[2].trim();
    if (!val) { out[key] = []; listKey = key; continue; }
    listKey = null;
    out[key] = val.startsWith("[") ? val.replace(/^\[|\]$/g, "").split(",").map(unq).filter(Boolean) : [unq(val)];
  }
  return out;
}
const unq = (s) => String(s).trim().replace(/^["']|["']$/g, "").trim();

// Parsed file -> [{ platform, label, url }] (https only, nothing else ends up clickable).
export function fundingLinks(parsed) {
  const out = [];
  for (const [key, vals] of Object.entries(parsed)) {
    for (const v of vals || []) {
      if (!v || /^(null|~)$/i.test(v)) continue;
      let url;
      if (key === "custom") url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
      else if (HANDLE[key] && /^[\w.@/-]+$/.test(v)) url = HANDLE[key](v);
      if (!url) continue;
      try { const u = new URL(url); if (u.protocol !== "https:") u.protocol = "https:"; out.push({ platform: key, label: LABEL[key] || key, url: u.href }); } catch {}
    }
  }
  return out;
}

const PLACES = [".github/FUNDING.yml", "FUNDING.yml", "docs/FUNDING.yml"];
export async function fetchFunding(owner, repo, { fetchImpl = fetch } = {}) {
  const get = async (o, r, p) => { try { const res = await fetchImpl(`https://raw.githubusercontent.com/${o}/${r}/HEAD/${p}`, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(15_000) }); return res.ok ? await res.text() : null; } catch { return null; } };
  for (const p of PLACES) { const t = await get(owner, repo, p); if (t) return { links: fundingLinks(parseFunding(t)), from: `${owner}/${repo}` }; }
  for (const p of PLACES) { const t = await get(owner, ".github", p); if (t) return { links: fundingLinks(parseFunding(t)), from: `${owner}/.github` }; }
  return { links: [], from: null };
}
