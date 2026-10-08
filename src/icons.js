// Folder artwork. macOS: icon lives in the folder (Finder resource fork).
// Windows: desktop.ini + folder.ico - honoured only when the folder carries the
// read-only attribute, which a copy from the Mac drops, so the Transfer folder
// also gets "Apply Icons.bat" for the PC.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

// Scale so the longest side is 256 px (ICO limit). Electron's nativeImage when
// we're in the app, sips on a Mac CLI, else the PNG goes in untouched.
async function fitPng(src, dest) {
  if (process.versions.electron) {
    const { nativeImage } = await import("electron");
    const img = nativeImage.createFromPath(src);
    const { width, height } = img.getSize();
    if (!width) throw new Error("Artwork is not a readable image.");
    const scaled = width >= height ? img.resize({ width: Math.min(256, width) }) : img.resize({ height: Math.min(256, height) });
    fs.writeFileSync(dest, scaled.toPNG());
    return scaled.getSize();
  }
  fs.copyFileSync(src, dest);
  if (process.platform === "darwin") execFileSync("sips", ["-Z", "256", dest], { stdio: "ignore" });
  const m = /pixelWidth: (\d+)[\s\S]*pixelHeight: (\d+)/.exec(process.platform === "darwin" ? execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", dest]).toString() : "");
  return m ? { width: +m[1], height: +m[2] } : { width: 0, height: 0 };
}

// ICO with a single PNG-compressed entry (Vista+). 0 in a size byte means 256.
export function pngToIco(png, { width, height }) {
  if (width > 256 || height > 256) throw new Error("ICO entries must be 256 px or smaller.");
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header[6] = width === 256 ? 0 : width; header[7] = height === 256 ? 0 : height;
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

export async function applyFolderArtwork(dir, artworkPath, { log = () => {}, target = "windows" } = {}) {
  const tmp = path.join(os.tmpdir(), `decomp-buddy-art-${process.pid}.png`);
  const size = await fitPng(artworkPath, tmp);
  const png = fs.readFileSync(tmp);
  if (target === "windows") {
    if (size.width) fs.writeFileSync(path.join(dir, "folder.ico"), pngToIco(png, size));
    fs.writeFileSync(path.join(dir, "desktop.ini"), "[.ShellClassInfo]\r\nIconResource=folder.ico,0\r\n");
  }
  if (process.platform === "linux") {
    // GNOME/Nautilus custom folder icon; harmless elsewhere.
    fs.copyFileSync(tmp, path.join(dir, ".folder-icon.png"));
    try { execFileSync("gio", ["set", dir, "metadata::custom-icon", `file://${path.join(dir, ".folder-icon.png")}`], { stdio: "ignore" }); } catch {}
  }
  if (process.platform === "darwin") {
    // JXA + AppKit: same call Finder's Get Info uses. Writes Icon\r + FinderInfo xattr.
    execFileSync("osascript", ["-l", "JavaScript", "-e",
      `ObjC.import("AppKit"); const img = $.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(tmp)}); $.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, ${JSON.stringify(dir)}, 0);`], { stdio: "ignore" });
  } else if (process.platform === "win32" && target === "windows") {
    execFileSync("attrib", ["+r", dir], { stdio: "ignore" });
    execFileSync("attrib", ["+s", "+h", path.join(dir, "desktop.ini")], { stdio: "ignore" });
  }
  fs.rmSync(tmp, { force: true });
  log(`Folder artwork set${process.platform !== "win32" && target === "windows" ? " (Windows side needs Apply Icons.bat once)" : ""}.`);
}

// Dropped in the output folder on non-Windows hosts: makes Explorer honour the icons after the copy.
export function writeApplyIconsBat(outDir) {
  const bat = [
    "@echo off",
    "rem Decomp Buddy: turn on the folder artwork after copying from the Mac.",
    'cd /d "%~dp0"',
    'for /d %%d in (*) do if exist "%%d\\desktop.ini" (',
    '  attrib +r "%%d"',
    '  attrib +s +h "%%d\\desktop.ini"',
    '  echo Icon on: %%d',
    ")",
    "echo Done. Explorer may need a refresh (F5).",
    "pause",
  ].join("\r\n");
  fs.writeFileSync(path.join(outDir, "Apply Icons.bat"), bat + "\r\n");
}
