// Settings presets ("Steam Deck", "TV", ...) for ports whose README names their settings file and
// keys (published facts: fullscreen / resolution / ultrawide / vsync). A preset only fills in keys
// the game actually has, in the style the file already uses (true/1/yes, "1280x800" or 1280,800).

export const PRESETS = {
  deck: { label: "Steam Deck", fullscreen: true, width: 1280, height: 800, vsync: true, ultrawide: false },
  tv4k: { label: "TV (4K)", fullscreen: true, width: 3840, height: 2160, vsync: true, ultrawide: false },
  tv1080: { label: "TV (1080p)", fullscreen: true, width: 1920, height: 1080, vsync: true, ultrawide: false },
  ultrawide: { label: "Ultrawide Monitor", fullscreen: true, width: 3440, height: 1440, ultrawide: true },
  window: { label: "In A Window", fullscreen: false, width: 1280, height: 720 },
};

// Keep the file's own spelling of true/false.
function boolLike(current, want) {
  const s = String(current ?? "").trim();
  if (/^(true|false)$/i.test(s)) return s === s.toUpperCase() ? String(want).toUpperCase() : s[0] === s[0].toUpperCase() ? (want ? "True" : "False") : String(want);
  if (/^(yes|no)$/i.test(s)) return want ? "yes" : "no";
  if (/^(on|off)$/i.test(s)) return want ? "on" : "off";
  if (/^[01]$/.test(s)) return want ? "1" : "0";
  return want;
}
function resolutionLike(current, w, h) {
  const s = String(current ?? "").trim();
  const m = s.match(/^(\d+)\s*([x×*,:])\s*(\d+)$/i);
  if (m) return `${w}${m[2]}${h}`;
  if (Array.isArray(current) && current.length === 2) return [w, h];
  return null; // a format we don't recognise (just a width, a scale factor...): leave it alone
}

// current: the values read from the file for the known keys. -> the values to write, and what was skipped.
export function presetValues(presetId, current) {
  const p = PRESETS[presetId]; if (!p) throw new Error("Unknown preset.");
  const out = {}, skipped = [];
  for (const k of Object.keys(current)) {
    const v = current[k];
    if (v === undefined) { skipped.push(k); continue; }
    if (k === "fullscreen" && p.fullscreen !== undefined) out[k] = boolLike(v, p.fullscreen);
    else if (k === "vsync" && p.vsync !== undefined) out[k] = boolLike(v, p.vsync);
    else if (k === "ultrawide" && p.ultrawide !== undefined) { if (/^(true|false|yes|no|on|off|0|1)$/i.test(String(v))) out[k] = boolLike(v, p.ultrawide); else skipped.push(k); }
    else if (k === "resolution" && p.width) { const r = resolutionLike(v, p.width, p.height); if (r === null) skipped.push(k); else out[k] = r; }
  }
  return { values: out, skipped };
}
