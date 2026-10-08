// Windows runtimes: the number one reason a port "won't start" on a PC is a missing Microsoft runtime.
// Which ones a game needs is read from its own files (the DLL names its programs import); whether
// they're installed is read from the registry / System32 / the .NET folder; installing uses
// Microsoft's own installers, downloaded from Microsoft, run silently (Windows asks for permission).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const RUNTIMES = {
  vcredist: { label: "Visual C++ Runtime", url: "https://aka.ms/vc14/vc_redist.x64.exe", file: "vc_redist.x64.exe", args: ["/install", "/quiet", "/norestart"] },
  directx: { label: "DirectX (June 2010) Runtime", url: "https://download.microsoft.com/download/1/7/1/1718ccc4-6315-4d8e-9543-8e28a4e18c4c/dxwebsetup.exe", file: "dxwebsetup.exe", args: ["/Q"] },
  dotnet8: { label: ".NET 8 Desktop Runtime", url: "https://aka.ms/dotnet/8.0/windowsdesktop-runtime-win-x64.exe", file: "windowsdesktop-runtime-8-win-x64.exe", args: ["/install", "/quiet", "/norestart"] },
};

// DLL names in a program's import table point at the runtime it needs.
const NEEDS = [
  ["vcredist", /\b(?:msvcp1[4-9]\d?|vcruntime14\d?(?:_1)?|concrt14\d?|vcomp14\d?)\.dll\b/i],
  ["directx", /\b(?:d3dx9_\d\d|d3dx10_\d\d|d3dx11_\d\d|d3dcompiler_4[0-3]|xinput1_[123]|xaudio2_[0-7]|x3daudio1_\d|xapofx1_\d)\.dll\b/i],
];
// Which runtimes a set-up game needs, from its .exe/.dll files and any .runtimeconfig.json.
export function runtimesNeeded(folder, { maxBytes = 80 * 1024 * 1024 } = {}) {
  const need = new Set();
  const files = [];
  const walk = (d, depth) => { if (depth > 3) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/^(Versions|Saves Backup|Decomp Buddy Mods|Game Files|Source)$/.test(e.name)) walk(p, depth + 1); } else files.push(p); } };
  walk(folder, 0);
  // Runtimes shipped next to the game count as present for that game.
  const local = new Set(files.map((f) => path.basename(f).toLowerCase()));
  for (const f of files) {
    if (/\.runtimeconfig\.json$/i.test(f)) { try { const j = JSON.parse(fs.readFileSync(f, "utf8")); const fw = [j.runtimeOptions?.framework, ...(j.runtimeOptions?.frameworks || [])].filter(Boolean); if (fw.some((x) => /WindowsDesktop/i.test(x.name) && /^8\./.test(x.version))) need.add("dotnet8"); } catch {} continue; }
    if (!/\.(exe|dll)$/i.test(f)) continue;
    let buf; try { if (fs.statSync(f).size > maxBytes) continue; buf = fs.readFileSync(f); } catch { continue; }
    if (buf.readUInt16LE(0) !== 0x5a4d) continue; // "MZ": a Windows program
    const text = buf.toString("latin1");
    for (const [id, re] of NEEDS) { const m = text.match(new RegExp(re.source, "gi")) || []; if (m.some((dll) => !local.has(dll.toLowerCase()))) need.add(id); }
  }
  return [...need];
}

// `reg query` output -> { Installed: "0x1", Version: "v14.40.33810.00", ... }
export function parseRegQuery(out) {
  const v = {};
  for (const line of String(out).split(/\r?\n/)) { const m = line.match(/^\s+(\S+)\s+REG_\w+\s+(.*)$/); if (m) v[m[1]] = m[2].trim(); }
  return v;
}

// What's installed on this PC. Only meaningful on Windows; elsewhere returns null.
export async function installedRuntimes({ platform = process.platform, env = process.env } = {}) {
  if (platform !== "win32") return null;
  const have = {};
  for (const key of ["HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64", "HKLM\\SOFTWARE\\Wow6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64"]) {
    try { const { stdout } = await run("reg", ["query", key]); const v = parseRegQuery(stdout); if (v.Installed === "0x1" || v.Version) { have.vcredist = v.Version || true; break; } } catch {}
  }
  const sys = path.join(env.SystemRoot || "C:\\Windows", "System32");
  have.directx = ["d3dx9_43.dll", "xinput1_3.dll", "xaudio2_7.dll"].every((f) => fs.existsSync(path.join(sys, f)));
  const dn = path.join(env.ProgramFiles || "C:\\Program Files", "dotnet", "shared", "Microsoft.WindowsDesktop.App");
  have.dotnet8 = (() => { try { return fs.readdirSync(dn).some((v) => /^8\./.test(v)); } catch { return false; } })();
  return have;
}

export async function checkRuntimes(folder) {
  const have = await installedRuntimes();
  if (!have) return null;
  const needed = folder ? runtimesNeeded(folder) : Object.keys(RUNTIMES);
  return { needed, missing: needed.filter((id) => !have[id]).map((id) => ({ id, label: RUNTIMES[id].label })) };
}

// Download each missing runtime from Microsoft and run its silent installer. Windows shows its own
// permission prompt; exit code 3010 means "installed, restart needed", 1638 "a newer one is installed".
export async function installRuntimes(ids, { download, log = () => {}, tmp = os.tmpdir() }) {
  const installed = [], failed = [];
  for (const id of ids) {
    const r = RUNTIMES[id]; if (!r) continue;
    const file = path.join(tmp, `decomp-buddy-${r.file}`);
    try {
      log(`Downloading ${r.label} from Microsoft…`);
      await download(r.url, file, log);
      log(`Installing ${r.label}…`);
      await new Promise((resolve, reject) => execFile(file, r.args, (err) => { const code = err?.code; if (!err || code === 3010 || code === 1638) resolve(); else reject(new Error(`installer exited with ${code}`)); }));
      installed.push(r.label);
    } catch (err) { log(`${r.label}: ${err.message}`); failed.push(r.label); }
    finally { fs.rmSync(file, { force: true }); }
  }
  return { installed, failed };
}
