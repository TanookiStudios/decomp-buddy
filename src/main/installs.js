// Roll back, nightly (CI) builds, per-game settings.
import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { listVersions, rollBack, keepVersion, stashPlaced } from "../versions.js";
import { listArtifacts, fetchArtifact } from "../nightly.js";
import { findConfig, readConfig, writeConfig } from "../gameconfig.js";
import { PRESETS, presetValues } from "../presets.js";
import { backupSaves, savePathsFor } from "../saves.js";
import { fetchPublished, planKey } from "../plans.js";
import { upgradeManifest, writeInstallHtml } from "../installhtml.js";
import { DownloadCtrl, listFiles } from "../setup.js";
import { logTo, loadSettings, plansFileFor } from "./core.js";
import { savesOf } from "./files.js";

const MANIFEST = "decomp-buddy.json";
const readM = (folder) => upgradeManifest(JSON.parse(fs.readFileSync(path.join(folder, MANIFEST), "utf8")));
const writeM = (folder, m) => fs.writeFileSync(path.join(folder, MANIFEST), JSON.stringify(m, null, 2));
const placedOf = (folder, m) => (m.plan?.game_files || []).filter((f) => f.placed).map((f) => path.join(folder, f.drop_into || "Game Files", f.placed.name));
async function savesFirst(folder, reason, log) { try { const s = await savesOf(folder); if (s.paths.length) await backupSaves(folder, s.paths, { reason, log }); } catch (err) { log(`  couldn't back up saves: ${err.message}`); } }

// ---- Roll back
ipcMain.handle("versions:list", (_e, { folder }) => { const m = readM(folder); return { current: m.release?.tag || null, channel: m.channel || "release", versions: listVersions(folder).map(({ tag, keptAt }) => ({ tag, keptAt })) }; });
ipcMain.handle("versions:rollback", async (e, { folder, tag }) => {
  const log = (x) => logTo(e.sender, x); const m = readM(folder);
  if (!m.release?.files?.length) throw new Error("This copy was set up before versions were tracked - update it once, then roll back is available.");
  await savesFirst(folder, "before-rollback", log);
  const r = rollBack(folder, { currentTag: m.release.tag, currentFiles: m.release.files, tag, placed: placedOf(folder, m), log });
  m.previousTag = m.release.tag; m.release = { ...m.release, tag: r.tag, files: r.files, rolledBackAt: new Date().toISOString() }; m.channel = /^ci-/.test(r.tag) ? "nightly" : "release";
  writeM(folder, m); try { writeInstallHtml(path.dirname(folder)); } catch {}
  return { tag: r.tag };
});

// ---- Nightly (CI) builds
ipcMain.handle("nightly:list", async (_e, { folder }) => { const m = readM(folder); const [owner, repo] = String(m.repo).split("/"); return { hasToken: !!process.env.GITHUB_TOKEN, artifacts: await listArtifacts({ owner, repo, target: m.target || "windows" }) }; });
let nightlyCtrl = null;
ipcMain.handle("nightly:install", async (e, { folder, id, name, runId }) => {
  if (nightlyCtrl) throw new Error("A CI build is already downloading.");
  const log = (x) => logTo(e.sender, x); const m = readM(folder); const [owner, repo] = String(m.repo).split("/");
  log(`--- Nightly: ${name} for ${m.plan?.game_title}`);
  nightlyCtrl = new DownloadCtrl();
  const stage = path.join(folder, ".decomp-buddy-nightly");
  try {
    const root = await fetchArtifact({ owner, repo, id, stageDir: stage, log, ctrl: nightlyCtrl });
    await savesFirst(folder, "before-nightly", log);
    const unstash = stashPlaced(folder, placedOf(folder, m));
    const files = listFiles(root).filter((f) => !/(^|[\\/])\.DS_Store$/.test(f));
    try {
      if (m.release?.files?.length) keepVersion(folder, m.release.tag, m.release.files, { log });
      for (const f of files) { const to = path.join(folder, f); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.rmSync(to, { force: true }); fs.renameSync(path.join(root, f), to); }
    } finally { unstash(); fs.rmSync(stage, { recursive: true, force: true }); }
    m.previousTag = m.release?.tag || null;
    m.release = { tag: `ci-${runId || id}`, name, url: `https://github.com/${m.repo}/actions/runs/${runId || ""}`, files, installedAt: new Date().toISOString() };
    m.channel = "nightly"; m.status = "ready"; m.statusDetail = `CI build ${name} (run ${runId || id}).`;
    writeM(folder, m); try { writeInstallHtml(path.dirname(folder)); } catch {}
    log(`Installed ${name}. Roll Back returns to ${m.previousTag || "the previous build"}.`);
    return { tag: m.release.tag };
  } finally { nightlyCtrl = null; fs.rmSync(stage, { recursive: true, force: true }); }
});
ipcMain.handle("nightly:cancel", () => { nightlyCtrl?.cancel(); return true; });

// ---- Per-game settings
async function configOf(folder) {
  const m = readM(folder);
  const pub = await fetchPublished({ file: plansFileFor(loadSettings()), cacheDir: app.getPath("userData") }).catch(() => null);
  const facts = pub?.plans?.[planKey("github", ...String(m.repo).split("/"))]?.facts;
  const cfg = facts?.config;
  if (!cfg?.file) return { known: false };
  const extra = savePathsFor(facts, { gameDir: folder }).map((p) => path.dirname(p.path));
  const file = findConfig(folder, cfg.file, extra);
  const keys = Object.fromEntries(Object.entries(cfg.keys || {}).filter(([, v]) => v));
  return { known: true, name: cfg.file, format: cfg.format, keys, file };
}
ipcMain.handle("config:get", async (_e, { folder }) => {
  const c = await configOf(folder);
  if (!c.known) return { known: false };
  if (!c.file) return { ...c, exists: false };
  const editable = ["json", "toml", "ini", "cfg", "yaml"].includes(c.format) && Object.keys(c.keys).length;
  return { ...c, exists: true, editable: !!editable, values: editable ? readConfig(fs.readFileSync(c.file, "utf8"), c.format === "cfg" ? "ini" : c.format, c.keys) : {}, presets: Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label })) };
});
// A preset fills the form (nothing is written until Save): only keys this game has, in its own format.
ipcMain.handle("config:preset", async (_e, { folder, id }) => {
  const c = await configOf(folder); if (!c.file) throw new Error("The settings file isn't there yet - start the game once.");
  const values = readConfig(fs.readFileSync(c.file, "utf8"), c.format === "cfg" ? "ini" : c.format, c.keys);
  return presetValues(id, Object.fromEntries(Object.keys(c.keys).map((k) => [k, values[k]])));
});
ipcMain.handle("config:set", async (e, { folder, values }) => {
  const c = await configOf(folder); if (!c.file) throw new Error("The settings file isn't there yet - start the game once.");
  const text = fs.readFileSync(c.file, "utf8");
  fs.copyFileSync(c.file, `${c.file}.before-decomp-buddy`); // one undo, always
  fs.writeFileSync(c.file, writeConfig(text, c.format === "cfg" ? "ini" : c.format, c.keys, values));
  logTo(e.sender, `Settings written to ${c.file} (previous copy: ${path.basename(c.file)}.before-decomp-buddy)`);
  return true;
});
