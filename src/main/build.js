// Moved out of main.js unchanged (2026-09-23): build IPC handlers.
import { ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { writeInstallHtml, upgradeManifest } from "../installhtml.js";
import { checkTools, buildFromSource } from "../builder.js";
import { logTo } from "./core.js";

// ---------- Build from source (Mac/Linux target on this machine) ----------
let buildState = null;
ipcMain.handle("build:tools", () => checkTools());
ipcMain.handle("build:run", async (e, { folder }) => {
  if (buildState) throw new Error("A build is already running.");
  const m = upgradeManifest(JSON.parse(fs.readFileSync(path.join(folder, "decomp-buddy.json"), "utf8")));
  const log = (l) => logTo(e.sender, l);
  buildState = { cancelled: false, child: null };
  log(`--- Build from source: ${m.repo}`);
  try {
    const r = await buildFromSource({ repoUrl: m.repoUrl, dir: folder, hint: m.plan?.build?.executable, log, state: buildState });
    m.plan.build.method = "built"; m.plan.build.executable = path.basename(r.executable); m.status = "ready"; m.statusDetail = `Built here on ${new Date().toISOString().slice(0, 10)}.`;
    fs.writeFileSync(path.join(folder, "decomp-buddy.json"), JSON.stringify(m, null, 2));
    try { writeInstallHtml(path.dirname(folder)); } catch {}
    return { executable: r.executable };
  } finally { buildState = null; }
});
ipcMain.handle("build:cancel", () => { if (buildState) { buildState.cancelled = true; try { buildState.child?.kill("SIGTERM"); } catch {} } return true; });
