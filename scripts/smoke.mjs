// Headless smoke harness: runs Decomp Buddy hidden, on its own throwaway profile (never the real
// one), evaluates a renderer script and prints RESULT <json>. Never leaves a window or dialog.
// Use scripts/smoke.sh, which checks both files exist before Electron is started.
//   scripts/smoke.sh <renderer-script.js> <profileDir>
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
process.on("uncaughtException", (e) => { console.log("RESULT-ERROR " + (e?.stack || e)); process.exit(4); });
process.on("unhandledRejection", (e) => { console.log("RESULT-ERROR " + (e?.stack || e)); process.exit(4); });
setTimeout(() => { console.log("RESULT-TIMEOUT"); app.exit(3); }, Number(process.env.SMOKE_TIMEOUT || 240000));

const [script, profile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!script || !fs.existsSync(script) || !profile) { console.log("RESULT-ERROR usage: smoke.mjs <script> <profileDir>"); process.exit(4); }
fs.mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
process.env.DECOMP_HEADLESS = "1";
const code = fs.readFileSync(script, "utf8");
app.on("browser-window-created", (_e, win) => {
  win.webContents.on("render-process-gone", (_x, d) => { console.log("RESULT-ERROR renderer gone " + JSON.stringify(d)); app.exit(5); });
  win.webContents.once("did-finish-load", async () => {
    try {
      if (process.env.SMOKE_SEND) { const [ch, payload] = JSON.parse(process.env.SMOKE_SEND); setTimeout(() => win.webContents.send(ch, payload), 1500); }
      const r = await win.webContents.executeJavaScript(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); await wait(300); ${code} })()`);
      // SMOKE_SHOT=<file.png>: a picture of the (hidden) window, for the record.
      if (process.env.SMOKE_SHOT) { const img = await win.webContents.capturePage(); fs.writeFileSync(process.env.SMOKE_SHOT, img.toPNG()); }
      console.log("RESULT " + JSON.stringify(r, null, 1));
      app.exit(r && r.ok === false ? 1 : 0);
    } catch (err) { console.log("RESULT-ERROR " + err.message); app.exit(2); }
  });
});
await import(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "main.js"));
