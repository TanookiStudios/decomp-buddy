// What a port adds, as badges: 60 FPS, Widescreen, HD, Ray Tracing, Mods, Online, Co-Op. Only what its own README
// says, quoted. This finds the candidate sentences; scripts/features.mjs has an agent decide which really claim the
// feature (a regex alone would badge "60 FPS is not supported yet"). Stored as facts.features { key: quote }.
import { sentenceAround } from "./ailabel.js";

export const FEATURES = {
  fps60: { label: "60 FPS", re: /\b(?:60|120|144|240)\s?fps\b|\bhigh(?:er)? frame ?rates?\b|\bunlocked frame ?rates?\b|\bframe ?rate unlock|\binterpolat\w* frames?\b|\bframe interpolation\b/i },
  widescreen: { label: "Widescreen", re: /\bwide ?screen\b|\bultra-?wide\b|\b16:9\b|\b21:9\b|\baspect ratios?\b/i },
  hd: { label: "HD", re: /\b(?:4k|1080p|1440p|2160p)\b|\bhigh(?:er)?[- ]resolution\b|\bhd (?:textures?|graphics|resolution|rendering)\b|\binternal resolution\b|\bany resolution\b|\bupscal\w*\b|\bhi-?res\b/i },
  raytracing: { label: "Ray Tracing", re: /\bray[- ]?trac\w*\b|\bpath[- ]?trac\w*\b|\brtx\b/i },
  mods: { label: "Mods", re: /\bmods?\b|\bmodding\b|\bmod (?:support|loader|manager)\b|\btexture packs?\b/i },
  online: { label: "Online Play", re: /\bonline (?:multiplayer|play|co-?op)\b|\bnetplay\b|\bnetworked multiplayer\b|\bplay online\b/i },
  coop: { label: "Local Multiplayer", re: /\bsplit-?screen\b|\blocal (?:multiplayer|co-?op)\b|\bcouch co-?op\b|\b(?:2|two|four|4)[- ]players?\b/i },
};

// { feature: [sentences] } - up to 3 per feature, each one sentence of the README.
export function featureMentions(readme, { max = 3 } = {}) {
  const text = String(readme || "").replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, "").replace(/\(https?:[^)]*\)|https?:\/\/\S+/g, " "), out = {}; // links say nothing about the port
  for (const [key, { re }] of Object.entries(FEATURES)) {
    const g = new RegExp(re.source, "gi"), list = [];
    for (const m of text.matchAll(g)) { const q = sentenceAround(text, m.index); if (q && q.length > 12 && !list.includes(q)) list.push(q); if (list.length >= max) break; }
    if (list.length) out[key] = list;
  }
  return out;
}

// A README line under a "Planned" / "Roadmap" / "TODO" heading describes something that isn't there yet - unless the
// line itself says it's done. The agent only sees single lines, so the import checks the heading (16 such badges
// slipped through the first pass, 28 Oct 2026).
const NOT_YET = /planned|roadmap|\bto-?do\b|future (?:additions|features|plans|work)|coming soon|wish ?list|\bideas\b|\bgoals\b|upcoming/i;
const DONE = /✅|\bdone\b|completed|implemented/i;
const flat = (t) => String(t).replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\(https?:[^)]*\)|https?:\/\/\S+/g, " ").replace(/[*_`>#[\]|]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
export function underNotYetHeading(readme, quote) {
  const lines = String(readme || "").replace(/\r/g, "").split("\n"), q = flat(quote).slice(0, 60);
  let head = "";
  for (const l of lines) {
    if (/^\s{0,3}#{1,6}\s+/.test(l)) head = l.replace(/^\s*#+\s*/, "");
    else if (q && flat(l).includes(q)) return NOT_YET.test(head) && !DONE.test(head) && !DONE.test(l);
  }
  return false;
}
