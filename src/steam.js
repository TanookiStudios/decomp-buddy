// Steam non-Steam shortcuts: read/write the binary VDF Steam keeps per user, add our
// games with grid art. Steam must be closed while we write - it rewrites the file on exit.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";

// ---- binary VDF (the subset shortcuts.vdf uses: nested maps of strings and int32s)
export function parseVdf(buf) {
  let i = 0;
  const readStr = () => { const end = buf.indexOf(0, i); const s = buf.toString("utf8", i, end); i = end + 1; return s; };
  const readMap = () => {
    const out = {};
    for (;;) {
      const t = buf[i++];
      if (t === 0x08 || t === undefined) return out;
      const key = readStr();
      if (t === 0x00) out[key] = readMap();
      else if (t === 0x01) out[key] = readStr();
      else if (t === 0x02) { out[key] = buf.readInt32LE(i); i += 4; }
      else throw new Error(`Unknown VDF type ${t} at ${i}`);
    }
  };
  return readMap();
}

export function writeVdf(obj) {
  const parts = [];
  const str = (s) => Buffer.concat([Buffer.from(String(s), "utf8"), Buffer.from([0])]);
  const map = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") { parts.push(Buffer.from([0x00]), str(k)); map(v); parts.push(Buffer.from([0x08])); }
      else if (typeof v === "number") { const b = Buffer.alloc(4); b.writeInt32LE(v); parts.push(Buffer.from([0x02]), str(k), b); }
      else parts.push(Buffer.from([0x01]), str(k), str(v));
    }
  };
  map(obj);
  parts.push(Buffer.from([0x08]));
  return Buffer.concat(parts);
}

// Steam's id for a non-Steam shortcut: crc32(exe + appname) with the top bit set.
export const shortcutAppId = (exe, appName) => (zlib.crc32(Buffer.from(exe + appName, "utf8")) | 0x80000000) >>> 0;

export function steamDir() {
  const c = process.platform === "win32"
    ? [path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"), path.join(process.env.ProgramFiles || "C:\\Program Files", "Steam")]
    : process.platform === "darwin" ? [path.join(os.homedir(), "Library", "Application Support", "Steam")]
    : [path.join(os.homedir(), ".steam", "steam"), path.join(os.homedir(), ".local", "share", "Steam"), path.join(os.homedir(), ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam")];
  return c.find((d) => fs.existsSync(path.join(d, "userdata"))) || null;
}

export function steamRunning() {
  try {
    const out = process.platform === "win32" ? execFileSync("tasklist", [], { encoding: "utf8" }) : execFileSync("ps", ["-A", "-o", "comm="], { encoding: "utf8" });
    return /(^|[\\/\s])steam(_osx|\.exe|webhelper)?$/im.test(out) || /\bsteam_osx\b|\bsteam\.exe\b/i.test(out);
  } catch { return false; }
}

// The Steam user folder we should write to: most recently touched config/.
export function userConfigDir(root) {
  const ud = path.join(root, "userdata");
  const users = fs.readdirSync(ud).filter((n) => /^\d+$/.test(n)).map((n) => path.join(ud, n, "config")).filter((p) => fs.existsSync(p));
  if (!users.length) return null;
  return users.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

// Add or update one shortcut. artwork: { portrait, square, hero } PNG buffers (optional).
export function installShortcut({ configDir, appName, exe, startDir, iconPath = "", launchOptions = "", tags = ["Decomp Buddy"], artwork = {} }) {
  const file = path.join(configDir, "shortcuts.vdf");
  const data = fs.existsSync(file) ? parseVdf(fs.readFileSync(file)) : { shortcuts: {} };
  data.shortcuts ||= {};
  const quoted = `"${exe}"`;
  const appid = shortcutAppId(quoted, appName);
  const entries = Object.values(data.shortcuts);
  const existingKey = Object.keys(data.shortcuts).find((k) => data.shortcuts[k].appid === (appid | 0) || (data.shortcuts[k].AppName === appName && data.shortcuts[k].Exe === quoted));
  const key = existingKey ?? String(entries.length);
  data.shortcuts[key] = {
    appid: appid | 0, AppName: appName, Exe: quoted, StartDir: `"${startDir}"`, icon: iconPath, ShortcutPath: "", LaunchOptions: launchOptions,
    IsHidden: 0, AllowDesktopConfig: 1, AllowOverlay: 1, OpenVR: 0, Devkit: 0, DevkitGameID: "", DevkitOverrideAppID: 0, LastPlayTime: data.shortcuts[key]?.LastPlayTime || 0, FlatpakAppID: "",
    tags: Object.fromEntries(tags.map((t, i) => [String(i), t])),
  };
  fs.writeFileSync(file, writeVdf(data));
  const grid = path.join(configDir, "grid");
  fs.mkdirSync(grid, { recursive: true });
  if (artwork.portrait) fs.writeFileSync(path.join(grid, `${appid}p.png`), artwork.portrait);
  if (artwork.square) fs.writeFileSync(path.join(grid, `${appid}.png`), artwork.square);
  if (artwork.hero) fs.writeFileSync(path.join(grid, `${appid}_hero.png`), artwork.hero);
  return { appid, file, updated: existingKey !== undefined };
}
