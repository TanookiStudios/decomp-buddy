// Keep Running In The Background, closed the way a person closes it (the window's close button = win.close()):
// the window must be hidden, not destroyed, with its page still loaded. Quit must still close it.
// Run hidden: DECOMP_HEADLESS=1 DECOMP_NO_LAUNCH=1 npx electron scripts/smoke/tray.mjs <throwaway profile>
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
process.on("uncaughtException", (e) => { console.log("RESULT-ERROR " + (e?.stack || e)); process.exit(4); });
setTimeout(() => { console.log("RESULT-TIMEOUT"); app.exit(3); }, 60000);
const profile = process.argv.filter((a) => !a.startsWith("--")).at(-1);
if (!profile || profile.includes("Application Support")) { console.log("RESULT-ERROR need a throwaway profile"); process.exit(4); }
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(path.join(profile, "settings.json"), JSON.stringify({ runInBackground: true, legalAccepted: true }));
app.setPath("userData", profile);
process.env.DECOMP_HEADLESS = "1";
app.on("browser-window-created", (_e, win) => {
  win.webContents.once("did-finish-load", async () => {
    win.close(); await new Promise((r) => setTimeout(r, 500));
    const kept = !win.isDestroyed() && BrowserWindow.getAllWindows().length === 1;
    // A hidden window's page is paused (no CPU while in the tray), so it isn't asked anything: same page = not reloaded.
    const sameFrame = kept && !win.webContents.isDestroyed() && !win.webContents.isCrashed() && win.webContents.getURL().endsWith("index.html") && !win.isVisible();
    // Quit: the window really closes. The app's own quit is held back so this harness can print its result first.
    app.on("before-quit", (e) => e.preventDefault());
    const closed = new Promise((r) => win.once("closed", r));
    app.quitting = true; win.close(); await Promise.race([closed, new Promise((r) => setTimeout(r, 3000))]);
    const out = { ok: kept && sameFrame && win.isDestroyed(), kept, sameFrame, quitCloses: win.isDestroyed() };
    console.log("RESULT " + JSON.stringify(out)); app.exit(out.ok ? 0 : 1);
  });
});
await import(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "main.js"));
