// Regenerates install.html from every game folder's manifest: one checklist
// of exactly where each game file goes.

import fs from "node:fs";
import path from "node:path";
import { MANIFEST } from "./setup.js";
import { targetOf } from "./targets.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const STATUS = {
  ready: ["Ready", "ok"],
  files_needed: ["Files Needed", "warn"],
  needs_build: ["Needs Build", "warn"],
  needs_attention: ["Needs Attention", "warn"],
  unsupported: ["Not Installable", "bad"],
};

// Manifests written by older versions: the build block used to be called "windows".
export function upgradeManifest(m) {
  if (m?.plan && !m.plan.build && m.plan.windows) { m.plan.build = m.plan.windows; delete m.plan.windows; }
  if (m?.plan) {
    m.plan.build ||= { method: "unsupported", release_asset: null, release_tag: null, build_steps: [], required_tools: [], executable: null };
    for (const k of ["game_files", "first_run", "notes", "unsure"]) m.plan[k] ||= [];
    m.plan.mods ||= { supported: false, method: "unknown", folder: null, formats: [], notes: "", links: [] };
  }
  m.target ||= "windows";
  return m;
}

export function readManifests(outDir) {
  if (!fs.existsSync(outDir)) return [];
  return fs.readdirSync(outDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(outDir, e.name, MANIFEST))
    .filter((p) => fs.existsSync(p))
    .map((p) => { try { return upgradeManifest(JSON.parse(fs.readFileSync(p, "utf8"))); } catch { return null; } })
    .filter((m) => m && m.plan)
    .sort((a, b) => String(b.setUpAt || "").localeCompare(String(a.setUpAt || "")));
}

function fileRow(m, f) {
  const folder = `${m.folder}\\${(f.drop_into || "Game Files").replace(/\//g, "\\")}`;
  const pickerNote = f.how_provided === "in_app_picker" ? `<div class="muted">Then pick it in the app on first run</div>` : f.how_provided === "command_line" ? `<div class="muted">Used by a setup step, see First Run</div>` : "";
  const where = f.placed
    ? `<span class="ok">In Place</span> <code>${esc(folder)}\\${esc(f.placed.name)}</code>${f.placed.companions ? `<div class="muted">plus ${esc(f.placed.companions.join(", "))}</div>` : ""}${pickerNote}`
    : `<span class="warn">Still Needed</span> <code>${esc(folder)}</code>${pickerNote}`;
  const v = f.verification;
  const vline = v ? `<div class="${v.status === "match" ? "ok" : v.status === "mismatch" ? "warn" : "muted"}">${v.status === "match" ? "✓ " : v.status === "mismatch" ? "⚠ " : ""}${esc(v.summary)}</div>` : "";
  const need = [f.kind === "bios" && "System file", f.expected_region && !["any", "unknown"].includes(f.expected_region) && `${f.expected_region} version`, f.required_version].filter(Boolean).join(" · ");
  return `<tr>
    <td><strong>${esc(f.label)}</strong>${need ? ` <span class="muted">(${esc(need)})</span>` : ""}<div class="muted">${esc(f.description)}</div>${f.notes ? `<div class="muted">${esc(f.notes)}</div>` : ""}${vline}</td>
    <td>${esc(f.accepted_formats.join(", ") || "—")}${f.expected_filename ? `<div class="muted">Name it exactly <code>${esc(f.expected_filename)}</code></div>` : ""}</td>
    <td>${where}</td>
    <td class="check"><input type="checkbox" aria-label="Done: ${esc(f.label)} for ${esc(m.plan.game_title)}"${f.placed ? " checked disabled" : ""}></td>
  </tr>`;
}

function gameSection(m) {
  const p = m.plan;
  const shown = m.status === "ready" && (p.game_files || []).some((f) => !f.placed) ? "files_needed" : m.status;
  const [label, cls] = STATUS[shown] || ["Unknown", "warn"];
  const w = p.build || {};
  return `<section class="game">
  <header>
    <h2>${esc(p.game_title)} <span class="console">${esc(p.console)}</span></h2>
    <span class="badge ${cls}">${label}</span>
  </header>
  <p class="meta">${esc(targetOf(m.target).label)} · Folder <code>${esc(m.folder)}</code> · <a href="${esc(m.repoUrl)}">${esc(m.repo)}</a>${m.release ? ` · release <a href="${esc(m.release.url)}">${esc(m.release.tag)}</a>${m.downloadVerified === true ? ` <span class="ok">✓ download verified</span>` : m.downloadVerified === false ? ` <span class="warn">download not verified</span>` : ""}` : ""}${m.previousTag ? ` (updated from ${esc(m.previousTag)})` : ""} · set up ${esc(m.setUpAt.slice(0, 10))}${p.confidence !== "high" ? ` · confidence: ${esc(p.confidence)}` : ""}</p>
  ${m.statusDetail ? `<p class="detail ${cls}">${esc(m.statusDetail)}</p>` : ""}
  ${m.status === "unsupported" ? "" : `
  <h3>Drop Your Game Files</h3>
  ${(p.game_files || []).length ? `<table><thead><tr><th>What</th><th>Format</th><th>Put It Here</th><th>Done</th></tr></thead><tbody>${(p.game_files || []).map((f) => fileRow(m, f)).join("")}</tbody></table>` : `<p class="muted">The docs list no game files to supply.</p>`}
  ${(w.required_tools || []).length ? `<h3>${esc(targetOf(m.target).where === "the PC" ? "PC Needs" : "Machine Needs")}</h3><ul>${(w.required_tools || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
  ${w.method === "source" && (w.build_steps || []).length ? `<h3>Build On ${esc(targetOf(m.target).where.replace(/^(the|your) /, ""))}</h3><ol>${(w.build_steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
  ${(p.first_run || []).length ? `<h3>First Run</h3><ol>${(p.first_run || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
  ${w.executable ? `<p>Run <code>${esc(w.executable)}</code>.</p>` : ""}`}
  ${(p.notes || []).length ? `<h3>Good To Know</h3><ul>${(p.notes || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
  ${(p.unsure || []).length ? `<h3>Not Clear From The Docs</h3><ul class="muted">${(p.unsure || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
</section>`;
}

export function renderInstallHtml(manifests, outDir) {
  const body = manifests.length
    ? manifests.map(gameSection).join("\n")
    : `<p class="muted">No games set up yet.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Decomp Buddy - Install Checklist</title>
<style>
:root { --bg:#f7f6f2; --fg:#1d1d1b; --muted:#6a6a64; --line:#d9d7cf; --card:#fff; --ok:#1d7a3a; --warn:#a15b00; --bad:#b3261e; --code:#ecebe5; }
@media (prefers-color-scheme: dark) { :root { --bg:#161614; --fg:#ecebe5; --muted:#9a9a92; --line:#33332f; --card:#1f1f1c; --ok:#5fcb7f; --warn:#f0a94a; --bad:#ff7b72; --code:#2a2a26; } }
* { box-sizing:border-box }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; }
main { max-width:960px; margin:0 auto; padding:32px 20px 80px; }
h1 { font-size:28px; margin:0 0 4px }
.lede { color:var(--muted); margin:0 0 28px }
.game { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px 24px; margin:0 0 20px; break-inside:avoid }
.game header { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap }
h2 { font-size:22px; margin:0 } .console { font-weight:400; color:var(--muted); font-size:16px; margin-left:6px }
h3 { font-size:14px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:20px 0 8px }
.badge { font-size:13px; font-weight:600; padding:3px 10px; border-radius:999px; border:1px solid currentColor }
.ok { color:var(--ok) } .warn { color:var(--warn) } .bad { color:var(--bad) }
.meta { color:var(--muted); font-size:14px; margin:6px 0 0 } .detail { font-weight:600 }
.muted { color:var(--muted); font-size:14px }
code { background:var(--code); padding:2px 6px; border-radius:4px; font:13px/1.4 ui-monospace, Menlo, Consolas, monospace; word-break:break-all }
table { width:100%; border-collapse:collapse; font-size:15px } th, td { text-align:left; vertical-align:top; padding:8px 8px 8px 0; border-bottom:1px solid var(--line) }
th { font-size:13px; color:var(--muted); font-weight:600 } td.check, th:last-child { width:48px; text-align:center }
input[type=checkbox] { width:20px; height:20px }
a { color:inherit } ol, ul { margin:0; padding-left:22px } li { margin:4px 0 }
@media print { body { background:#fff; color:#000 } .game { border-color:#999; box-shadow:none } a { text-decoration:none } }
</style>
</head>
<body>
<main>
<h1>Install Checklist</h1>
<p class="lede">Everything below lives in <code>${esc(outDir)}</code>. Drop each game file into the folder shown, tick it off, then run the game on the PC.</p>
${body}
<p class="muted">Made by Decomp Buddy. Rerun "Clean Mac Junk" right before copying to the PC if you opened these folders in Finder.</p>
</main>
</body>
</html>
`;
}

export function writeInstallHtml(outDir) {
  const manifests = readManifests(outDir);
  const file = path.join(outDir, "install.html");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(file, renderInstallHtml(manifests, outDir));
  return { file, count: manifests.length };
}
