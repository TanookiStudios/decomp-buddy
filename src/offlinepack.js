// Offline Pack: everything a computer with no internet needs, in one folder you can put on an SD card
// or USB stick - the games (without old versions or scraps), an install.html that explains each one,
// the Windows runtimes those games need (full offline installers from Microsoft), and optionally
// Decomp Buddy itself (the portable Windows copy).

import fs from "node:fs";
import path from "node:path";
import { readManifests, renderInstallHtml } from "./installhtml.js";
import { writeApplyIconsBat } from "./icons.js";
import { isMacJunk } from "./junk.js";
import { runtimesNeeded } from "./winruntimes.js";
import { dirSize } from "./gametools.js";

// The offline installers (the web installer for DirectX needs the internet, so the full one here).
export const OFFLINE_RUNTIMES = {
  vcredist: { label: "Visual C++ Runtime", url: "https://aka.ms/vc14/vc_redist.x64.exe", file: "1 - Visual C++ Runtime (vc_redist.x64).exe", run: "double-click it, then Install" },
  directx: { label: "DirectX (June 2010) Runtime", url: "https://download.microsoft.com/download/8/4/a/84a35bf1-dafe-4ae8-82af-ad2ae20b6b14/directx_Jun2010_redist.exe", file: "2 - DirectX June 2010 (unpack, then run DXSETUP).exe", run: "double-click it, pick an empty folder to unpack into, then run DXSETUP.exe in that folder" },
  dotnet8: { label: ".NET 8 Desktop Runtime", url: "https://aka.ms/dotnet/8.0/windowsdesktop-runtime-win-x64.exe", file: "3 - .NET 8 Desktop Runtime.exe", run: "double-click it, then Install" },
};
const SKIP = /^(Versions|\.decomp-buddy-[\w-]+|\.DS_Store)$/;
const copyFilter = (src) => { const n = path.basename(src); return !SKIP.test(n) && !isMacJunk(n); };

export function packSize(folders) { return folders.reduce((n, f) => n + dirSize(f) - dirSize(path.join(f, "Versions")), 0); }

export async function makePack({ folders, destRoot, includeApp = false, includeRuntimes = true, download, fetchJson, log = () => {}, now = new Date(), latestUrl }) {
  const dir = path.join(destRoot, `Decomp Buddy Offline Pack ${now.toISOString().slice(0, 10)}`);
  if (fs.existsSync(dir)) throw new Error(`${path.basename(dir)} is already there - rename or move it first; nothing is overwritten.`);
  fs.mkdirSync(dir, { recursive: true });
  const copied = [];
  for (const f of folders) {
    const to = path.join(dir, path.basename(f));
    log(`Copying ${path.basename(f)}…`);
    await fs.promises.cp(f, to, { recursive: true, filter: copyFilter, preserveTimestamps: true });
    copied.push(to);
  }
  const manifests = readManifests(dir);
  fs.writeFileSync(path.join(dir, "install.html"), renderInstallHtml(manifests, dir));
  const windows = manifests.filter((m) => (m.target || "windows") === "windows");
  if (windows.length) writeApplyIconsBat(dir);
  const runtimes = [];
  if (includeRuntimes && windows.length) {
    const need = new Set(); for (const m of windows) for (const id of runtimesNeeded(path.join(dir, m.folder))) need.add(id);
    if (need.size) fs.mkdirSync(path.join(dir, "Windows Runtimes"), { recursive: true });
    for (const id of need) {
      const r = OFFLINE_RUNTIMES[id]; log(`Downloading ${r.label} from Microsoft…`);
      await download(r.url, path.join(dir, "Windows Runtimes", r.file), log);
      runtimes.push(r);
    }
  }
  let app = null;
  if (includeApp) {
    const latest = await fetchJson(latestUrl);
    const url = latest?.downloads?.["windows-portable"];
    if (!url) throw new Error("Couldn't find the portable Windows copy of Decomp Buddy to include.");
    const name = decodeURIComponent(url.split("/").pop());
    log(`Downloading ${name}…`);
    await download(url, path.join(dir, name), log);
    app = name;
  }
  fs.writeFileSync(path.join(dir, "START HERE.txt"), startHere({ games: manifests, runtimes, app, windows: windows.length > 0 }).join("\r\n") + "\r\n");
  return { dir, games: manifests.length, runtimes: runtimes.map((r) => r.label), app };
}

export function startHere({ games, runtimes, app, windows }) {
  const lines = ["Decomp Buddy Offline Pack", "=========================", "", "Copy this whole folder to the computer that will play the games (anywhere is fine), then:", ""];
  let n = 1;
  if (runtimes.length) { lines.push(`${n++}. Open "Windows Runtimes" and install each one, in number order:`); for (const r of runtimes) lines.push(`     - ${r.label}: ${r.run}.`); lines.push(""); }
  if (windows) { lines.push(`${n++}. Double-click "Apply Icons.bat" once so the game folders show their box art.`, ""); }
  lines.push(`${n++}. Open install.html in a browser: it says, game by game, what's ready and what still needs your own game files.`, "");
  if (app) lines.push(`${n++}. ${app} is Decomp Buddy for Windows - no install needed. In it, Settings → Library Folders → Add Folder… and pick this folder to see these games on the shelf.`, "");
  lines.push("Games in this pack:", ...games.map((m) => `  - ${m.plan?.game_title || m.folder} (${m.release?.tag || "version unknown"})`), "", "Your own game files (the ROMs and discs you placed) came along inside each game's folder - this pack is for your own computers, not for sharing.");
  return lines;
}
