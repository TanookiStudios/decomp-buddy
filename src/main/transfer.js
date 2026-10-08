// Moved out of main.js unchanged (2026-09-23): transfer IPC handlers.
import { ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { sweepMacJunk } from "../junk.js";
import { writeInstallHtml } from "../installhtml.js";
import { startReceiver, sendFolder, probeReceiver } from "../transfer.js";
import { defaultInstallDir } from "../targets.js";
import { execFileSync } from "node:child_process";
import { logTo, loadSettings } from "./core.js";

// ---------- LAN transfer ----------
let receiver = null;
ipcMain.handle("transfer:receive", async (e) => {
  if (receiver) return { port: receiver.port, code: receiver.code, addresses: receiver.addresses };
  const s = loadSettings();
  const dest = s.installDir || defaultInstallDir();
  receiver = await startReceiver(dest, {
    onLog: (m) => logTo(e.sender, m),
    onDone: () => {
      try {
        writeInstallHtml(dest);
        if (process.platform === "win32") for (const d of fs.readdirSync(dest)) { const ini = path.join(dest, d, "desktop.ini"); if (fs.existsSync(ini)) { try { execFileSync("attrib", ["+r", path.join(dest, d)]); execFileSync("attrib", ["+s", "+h", ini]); } catch {} } }
      } catch {}
      if (!e.sender.isDestroyed()) e.sender.send("transfer:received");
    },
  });
  return { port: receiver.port, code: receiver.code, addresses: receiver.addresses, dest };
});
ipcMain.handle("transfer:stop", async () => { if (receiver) { await receiver.stop(); receiver = null; } return true; });
ipcMain.handle("transfer:send", async (e, { folders, host, port, code }) => {
  await probeReceiver(host, port);
  const out = [];
  for (const folder of folders) {
    sweepMacJunk(folder); // no Icon\r or .DS_Store over the wire
    let last = 0;
    const r = await sendFolder(folder, { host, port, code, onLog: (m) => logTo(e.sender, m), onProgress: (b) => { if (b - last > 50e6) { last = b; logTo(e.sender, `  ${(b / 1e6).toFixed(0)} MB sent`); } } });
    out.push(r.name);
    logTo(e.sender, `Sent ${r.name}.`);
  }
  return out;
});
