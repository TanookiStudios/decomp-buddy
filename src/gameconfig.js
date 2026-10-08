// Per-game settings: fullscreen / resolution / ultrawide / vsync written into the port's own config
// file, in its own format. Edits are line-level, so comments, ordering and every key we don't know
// about survive untouched. Only keys the project's README names (plan facts) are offered.

import fs from "node:fs";
import path from "node:path";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Find the config file: in the game folder (a few levels deep) or a documented save/config folder.
export function findConfig(gameDir, file, extraDirs = []) {
  if (!file) return null;
  const base = path.basename(file);
  const direct = [path.join(gameDir, file), ...extraDirs.map((d) => path.join(d, base))].find((p) => fs.existsSync(p));
  if (direct) return direct;
  const walk = (d, depth) => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return null; } for (const e of es) { const p = path.join(d, e.name); if (e.isFile() && e.name.toLowerCase() === base.toLowerCase()) return p; if (e.isDirectory() && depth < 3 && !/^(Versions|Saves Backup|Game Files|\.)/.test(e.name)) { const f = walk(p, depth + 1); if (f) return f; } } return null; };
  return walk(gameDir, 0);
}

function jsonGet(obj, key) { if (key in obj) return obj[key]; for (const v of Object.values(obj)) if (v && typeof v === "object") { const r = jsonGet(v, key); if (r !== undefined) return r; } return undefined; }
function jsonSet(obj, key, value) { if (key in obj) { obj[key] = value; return true; } for (const v of Object.values(obj)) if (v && typeof v === "object" && jsonSet(v, key, value)) return true; return false; }
const typed = (old, v) => (typeof old === "boolean" ? v === true || v === "true" : typeof old === "number" ? Number(v) : v);

// Line formats: toml/ini/cfg use "key = value", yaml "key: value".
const lineRe = (format, key) => (format === "yaml" ? new RegExp(`^(\\s*${esc(key)}\\s*:\\s*)(.*?)(\\s*(#.*)?)$`, "m") : new RegExp(`^(\\s*${esc(key)}\\s*=\\s*)(.*?)(\\s*([#;].*)?)$`, "m"));
const unquote = (v) => v.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

export function readConfig(text, format, keys) {
  const out = {};
  if (format === "json") { let obj; try { obj = JSON.parse(text); } catch { return out; } for (const [k, key] of Object.entries(keys)) if (key) { const v = jsonGet(obj, key); if (v !== undefined) out[k] = v; } return out; }
  for (const [k, key] of Object.entries(keys)) { if (!key) continue; const m = text.match(lineRe(format, key)); if (m) out[k] = unquote(m[2]); }
  return out;
}

export function writeConfig(text, format, keys, values) {
  if (format === "json") {
    const obj = JSON.parse(text);
    for (const [k, v] of Object.entries(values)) { const key = keys[k]; if (!key) continue; const old = jsonGet(obj, key); if (old === undefined) throw new Error(`${key} isn't in the file yet - start the game once, then try again.`); jsonSet(obj, key, typed(old, v)); }
    const indent = (text.match(/^[{[]\s*\n(\s+)/) || [])[1] || "  ";
    return JSON.stringify(obj, null, indent) + (text.endsWith("\n") ? "\n" : "");
  }
  let out = text;
  for (const [k, v] of Object.entries(values)) {
    const key = keys[k]; if (!key) continue;
    const re = lineRe(format, key); const m = out.match(re);
    if (!m) throw new Error(`${key} isn't in the file yet - start the game once, then try again.`);
    const quoted = /^".*"$/.test(m[2]) ? `"${v}"` : /^'.*'$/.test(m[2]) ? `'${v}'` : String(v);
    out = out.replace(re, `$1${quoted.replace(/\$/g, "$$$$")}$3`);
  }
  return out;
}
