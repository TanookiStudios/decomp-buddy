// Move a folder to the Trash / Recycle Bin without Electron (the command line uses this; the app uses shell.trashItem).
// Never a permanent delete: if the system won't take it, it stays where it is and this throws.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const free = (dir, name) => { let n = 0, p; do p = path.join(dir, n ? `${name} ${n + 1}` : name); while (fs.existsSync(p) && ++n); return p; };
const sameVolume = (a, b) => { try { return fs.statSync(a).dev === fs.statSync(b).dev; } catch { return false; } };

export function moveToTrash(target, { platform = process.platform, home = os.homedir(), now = new Date() } = {}) {
  const p = path.resolve(target);
  if (!fs.existsSync(p)) throw new Error(`Nothing at ${p}.`);
  if (platform === "win32") {
    // Recycle Bin through .NET; the path travels in an environment variable, never inside the command text.
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "Add-Type -AssemblyName Microsoft.VisualBasic; $p=$env:DB_TRASH; if (Test-Path -LiteralPath $p -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,'OnlyErrorDialogs','SendToRecycleBin') } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,'OnlyErrorDialogs','SendToRecycleBin') }"],
      { env: { ...process.env, DB_TRASH: p }, stdio: "pipe" });
    return { to: "Recycle Bin" };
  }
  if (platform === "darwin") {
    const bin = path.join(home, ".Trash");
    if (!sameVolume(p, home)) throw new Error("That folder is on another drive - remove it from the app, or drag it to the Trash yourself.");
    // macOS guards ~/.Trash; a Terminal without Full Disk Access can't write there.
    const to = free(bin, path.basename(p));
    try { fs.renameSync(p, to); } catch (err) { if (err.code === "EPERM" || err.code === "EACCES") throw new Error("macOS didn't let the command line use the Trash. Remove the game from the app instead (Installed Games → More… → Remove Game)."); throw err; }
    return { to };
  }
  // freedesktop.org trash: files/ plus an .trashinfo saying where it came from, so "Restore" works.
  const base = path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "Trash");
  if (!sameVolume(p, home)) throw new Error("That folder is on another drive - remove it from the app, or move it to the trash yourself.");
  fs.mkdirSync(path.join(base, "files"), { recursive: true }); fs.mkdirSync(path.join(base, "info"), { recursive: true });
  const to = free(path.join(base, "files"), path.basename(p)), name = path.basename(to);
  fs.writeFileSync(path.join(base, "info", `${name}.trashinfo`), `[Trash Info]\nPath=${encodeURI(p)}\nDeletionDate=${now.toISOString().slice(0, 19)}\n`);
  fs.renameSync(p, to);
  return { to };
}
