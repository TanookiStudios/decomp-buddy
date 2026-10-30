// The changelog: docs/releases/<version>.md (English) and <version>.<lang>.md for each app language.
// Each file is "## New / ## Better / ## Fixed / ## Removed" sections of "- " bullets (translated headings in the
// other languages), with "<!-- released: YYYY-MM-DD -->" at the top once that version is out.
// The app shows it after an upgrade, the website builds /changelog from it, and release.sh refuses to ship without it.
import fs from "node:fs";
import path from "node:path";

export const LANGS = ["en", "es", "pt-BR", "fr", "de", "ja"];
export const SECTIONS = ["New", "Better", "Fixed", "Removed"];

const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
export const newer = (a, b) => cmp(a, b) > 0;

const shape = (md) => ({ headings: (md.match(/^## .+$/gm) || []).length, bullets: (md.match(/^- .+$/gm) || []).length });

// { versions: [{ version, date|null, notes: { en: md, ... } }] } newest first, from a folder of release notes.
export function readChangelog(dir) {
  const byVersion = new Map();
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(\d+\.\d+\.\d+)(?:\.([A-Za-z-]+))?\.md$/); if (!m) continue;
    const lang = m[2] || "en"; if (!LANGS.includes(lang)) continue;
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    const v = byVersion.get(m[1]) || { version: m[1], date: null, notes: {} };
    const date = raw.match(/<!--\s*released:\s*(\d{4}-\d{2}-\d{2})\s*-->/)?.[1];
    if (lang === "en" && date) v.date = date;
    v.notes[lang] = raw.replace(/<!--[\s\S]*?-->\s*/g, "").trim();
    byVersion.set(m[1], v);
  }
  return { versions: [...byVersion.values()].sort((a, b) => cmp(b.version, a.version)) };
}

// Every problem with one version's notes, as plain sentences. Empty = ready to ship.
export function checkVersion(log, version) {
  const v = log.versions.find((x) => x.version === version);
  if (!v?.notes.en) return [`docs/releases/${version}.md is missing - write what's new, better, fixed and removed.`];
  const problems = [], en = v.notes.en, want = shape(en);
  const bad = (en.match(/^## .+$/gm) || []).map((h) => h.slice(3).trim()).filter((h) => !SECTIONS.includes(h));
  if (bad.length) problems.push(`${version}.md has headings other than ${SECTIONS.join(" / ")}: ${bad.join(", ")}.`);
  if (!want.headings || !want.bullets) problems.push(`${version}.md needs at least one "## " section with "- " bullets.`);
  for (const lang of LANGS.slice(1)) {
    const t = v.notes[lang];
    if (!t) { problems.push(`docs/releases/${version}.${lang}.md is missing.`); continue; }
    const got = shape(t);
    if (got.headings !== want.headings || got.bullets !== want.bullets) problems.push(`${version}.${lang}.md has ${got.headings} sections and ${got.bullets} bullets; English has ${want.headings} and ${want.bullets} - it's out of date.`);
  }
  return problems;
}

// What the What's New window shows after an upgrade: every version newer than the last one seen, up to this one.
export function sinceLastSeen(log, lastSeen, current) {
  return log.versions.filter((v) => !newer(v.version, current) && (!lastSeen || newer(v.version, lastSeen)));
}
