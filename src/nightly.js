// Nightly builds: some projects publish GitHub Actions artifacts far more often than releases.
// Listing is public; downloading an artifact needs a GitHub token (GitHub's rule, not ours).

import fs from "node:fs";
import path from "node:path";
import { extractZip, download } from "./setup.js";

const API = "https://api.github.com";
const TARGET_RE = { windows: /win(dows)?|msvc|mingw/i, linux: /linux|ubuntu|appimage|x86_64-unknown/i, "macos-arm64": /mac|osx|darwin|apple|arm64/i, "macos-x64": /mac|osx|darwin|apple|x64|intel/i };
const OTHER_TARGETS = { windows: /linux|mac|osx|darwin|android|switch|flatpak/i, linux: /win(dows)?|mac|osx|darwin|android|switch/i, "macos-arm64": /win(dows)?|linux|android|switch|flatpak/i, "macos-x64": /win(dows)?|linux|android|switch|flatpak/i };

export function pickArtifacts(list, target, defaultBranch) {
  return (list || []).filter((a) => !a.expired && TARGET_RE[target]?.test(a.name) && !OTHER_TARGETS[target]?.test(a.name.replace(TARGET_RE[target], "")))
    .map((a) => ({ id: a.id, name: a.name, size: a.size_in_bytes, createdAt: a.created_at, branch: a.workflow_run?.head_branch || "", runId: a.workflow_run?.id || null, debug: /debug/i.test(a.name), flatpak: /flatpak/i.test(a.name) }))
    .sort((a, b) => (b.branch === defaultBranch) - (a.branch === defaultBranch) || a.debug - b.debug || a.flatpak - b.flatpak || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);
}

export async function listArtifacts({ owner, repo, target, fetchImpl = fetch }) {
  const h = { "User-Agent": "decomp-buddy", Accept: "application/vnd.github+json" };
  const meta = await (await fetchImpl(`${API}/repos/${owner}/${repo}`, { headers: h })).json().catch(() => ({}));
  const res = await fetchImpl(`${API}/repos/${owner}/${repo}/actions/artifacts?per_page=100`, { headers: h });
  if (res.status === 403) throw new Error("GitHub rate limit hit - add a GitHub token in Settings.");
  if (!res.ok) throw new Error(`GitHub ${res.status} listing CI builds.`);
  return pickArtifacts((await res.json()).artifacts, target, meta.default_branch || "main");
}

// Download + unpack into a staging folder; artifacts are zips that sometimes wrap one more archive.
export async function fetchArtifact({ owner, repo, id, stageDir, log = () => {}, ctrl = null }) {
  if (!process.env.GITHUB_TOKEN) throw new Error("Downloading CI builds needs a GitHub token - add one in Settings (free, read-only).");
  fs.rmSync(stageDir, { recursive: true, force: true }); fs.mkdirSync(stageDir, { recursive: true });
  const zip = path.join(stageDir, "artifact.zip");
  await download(`${API}/repos/${owner}/${repo}/actions/artifacts/${id}/zip`, zip, log, { ctrl, digest: undefined });
  const out = path.join(stageDir, "unpacked");
  extractZip(zip, out); fs.rmSync(zip, { force: true });
  // CI artifacts often wrap the real build: one archive or .dmg, maybe beside a readme. Unwrap it and keep the readme.
  const inner = fs.readdirSync(out).filter((n) => n !== ".DS_Store");
  const archives = inner.filter((n) => /\.(zip|7z|tar|tgz|tar\.(gz|xz|bz2|zst)|dmg)$/i.test(n));
  if (archives.length === 1 && inner.every((n) => n === archives[0] || /\.(txt|md|pdf|html?)$/i.test(n) || /^(readme|license|licence|changelog)/i.test(n))) {
    const out2 = path.join(stageDir, "unpacked2");
    extractZip(path.join(out, archives[0]), out2);
    for (const n of inner) if (n !== archives[0]) fs.renameSync(path.join(out, n), path.join(out2, n));
    return out2;
  }
  return out;
}
