// Make It Yours: copy a picked picture or music file into userData/theme and hand it to the page.
// The page only ever names the kind; the file always comes from the saved setting, never a path it sent.
import { BrowserWindow, ipcMain, dialog, app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { loadSettings, saveSettings } from "./core.js";
import { cleanLook, lookFileProblem, lookExt, LOOK_FILES, LOOK_MIME } from "../look.js";

export const themeDir = () => path.join(app.getPath("userData"), "theme");

// Save the look and delete any copied file it no longer uses (a replaced or removed picture).
export function saveLook(s, look) {
  if (look) s.look = cleanLook(look); else delete s.look;
  saveSettings(s);
  try { for (const f of fs.readdirSync(themeDir())) if (f !== s.look?.bgImage && f !== s.look?.music) fs.rmSync(path.join(themeDir(), f), { force: true }); } catch {}
  return s.look || cleanLook();
}

ipcMain.handle("look:choose", async (e, { kind } = {}) => {
  const k = LOOK_FILES[kind]; if (!k) throw new Error("Unknown file kind.");
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ["openFile"], filters: [{ name: kind === "image" ? "Pictures" : "Music", extensions: k.exts }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const src = r.filePaths[0], why = lookFileProblem(kind, src, fs.statSync(src).size);
  if (why) throw new Error(why);
  const name = `${kind}-${Date.now()}.${lookExt(src)}`;
  fs.mkdirSync(themeDir(), { recursive: true });
  fs.copyFileSync(src, path.join(themeDir(), name));
  const s = loadSettings();
  return saveLook(s, { ...s.look, [k.key]: name });
});

// image: a data: URL (img-src already allows those); music: the bytes, which the page turns into a blob: URL.
ipcMain.handle("look:media", (_e, { kind } = {}) => {
  const k = LOOK_FILES[kind], name = k && cleanLook(loadSettings().look)[k.key];
  if (!name) return null;
  const file = path.join(themeDir(), name), type = LOOK_MIME[lookExt(name)];
  if (!fs.existsSync(file)) return null;
  return kind === "image" ? `data:${type};base64,${fs.readFileSync(file).toString("base64")}` : { bytes: fs.readFileSync(file), type };
});
