// Source: Alexbeav's PS1 recomps - a static site whose catalog-data.js assigns
// window.CATALOG_GAMES = [ {slug, title, region, serial, bios, discs, repository,
// windows, linux, macosArm64, macosX64, images, knownIssues}, ... ].
// Parsed without executing it: unquoted keys are quoted outside strings, then JSON.parse.

export const SOURCE = { id: "alexbeav", label: "alexbeavs-ps1-ports.github.io", url: "https://alexbeavs-ps1-ports.github.io/psxrecomp-ports/" };
const DATA_URL = "https://alexbeavs-ps1-ports.github.io/psxrecomp-ports/catalog-data.js";
const SCREENSHOT_BASE = "https://raw.githubusercontent.com/alexbeavs-ps1-ports/psxrecomp-ports/main/screenshots/v0.2.0/";

// Turn a JS object literal (unquoted keys, double-quoted strings, trailing commas) into JSON.
export function literalToJson(src) {
  let out = "", i = 0, inStr = false;
  while (i < src.length) {
    const c = src[i];
    if (inStr) { out += c; if (c === "\\") { out += src[++i]; } else if (c === '"') inStr = false; i++; continue; }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    const m = /^[A-Za-z_$][\w$]*(?=\s*:)/.exec(src.slice(i));
    if (m) { out += `"${m[0]}"`; i += m[0].length; continue; }
    out += c; i++;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function parseCatalogData(js) {
  const m = js.match(/CATALOG_GAMES\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
  if (!m) throw new Error("catalog-data.js has no CATALOG_GAMES array - layout changed?");
  const raw = JSON.parse(literalToJson(m[1]));
  return raw.map((g) => {
    const rm = String(g.repository || "").match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    const owner = rm ? rm[1] : null, repo = rm ? rm[2].replace(/\.git$/, "") : null;
    const tag = (g.windows || g.linux || "").match(/\/download\/([^/]+)\//)?.[1] || null;
    const assets = { windows: g.windows || null, linux: g.linux || null, "macos-arm64": g.macosArm64 || null, "macos-x64": g.macosX64 || null };
    return {
      source: SOURCE.id,
      id: owner ? `github:${owner}/${repo}`.toLowerCase() : `project:${String(g.slug || g.title).toLowerCase()}`,
      title: g.title, project: repo || g.slug, console: "PlayStation",
      platforms: [g.windows && "Windows", g.linux && "Linux", (g.macosArm64 || g.macosX64) && "macOS"].filter(Boolean),
      repoUrl: g.repository || "", repoHost: owner ? "github" : null, owner, repo,
      version: tag, releaseUrl: tag && owner ? `https://github.com/${owner}/${repo}/releases/tag/${tag}` : "",
      status: "unknown", updatedAt: "",
      iconUrl: g.images?.length ? SCREENSHOT_BASE + g.images[0][0] : "",
      website: SOURCE.url + "#" + (g.slug || ""), aiAssisted: false,
      assets, region: g.region || "", serial: g.serial || "", bios: g.bios || "", discs: g.discs || 1, knownIssues: g.knownIssues || "",
    };
  });
}

export async function fetchSource() {
  const res = await fetch(DATA_URL, { headers: { "User-Agent": "decomp-buddy" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${SOURCE.label} answered ${res.status}`);
  return parseCatalogData(await res.text());
}
