#!/usr/bin/env node
// The changelog for release.sh and the website (see src/changelog.js).
//   check <version>          exit 1 and say why if that version's notes are missing or out of date in any language
//   stamp <version> <date>   mark it released (YYYY-MM-DD) in every language file
//   site <file>              write every released version, rendered, for decompbuddy.com/changelog
//   github <version>         the GitHub release page text: the download line + the English notes
import fs from "node:fs";
import path from "node:path";
import { readChangelog, checkVersion, LANGS } from "../src/changelog.js";
import { renderMarkdown } from "../src/readme.js";

const DIR = path.join(import.meta.dirname, "..", "docs", "releases");
const [cmd, a, b] = process.argv.slice(2);
const log = readChangelog(DIR);

if (cmd === "check") {
  const problems = checkVersion(log, a);
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(problems.length ? 1 : 0);
} else if (cmd === "stamp") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b || "")) { console.error("✗ stamp needs a YYYY-MM-DD date"); process.exit(1); }
  for (const lang of LANGS) {
    const f = path.join(DIR, lang === "en" ? `${a}.md` : `${a}.${lang}.md`), text = fs.readFileSync(f, "utf8");
    if (!/<!--\s*released:/.test(text)) fs.writeFileSync(f, `<!-- released: ${b} -->\n${text}`);
  }
} else if (cmd === "site") {
  const versions = log.versions.filter((v) => v.date).map((v) => ({ version: v.version, date: v.date, html: Object.fromEntries(LANGS.map((l) => [l, renderMarkdown(v.notes[l] || v.notes.en)])) }));
  fs.writeFileSync(a, JSON.stringify({ schema: 1, languages: LANGS, versions }, null, 1));
  console.log(`changelog: ${versions.length} released version(s) -> ${a}`);
} else if (cmd === "github") {
  const v = log.versions.find((x) => x.version === a);
  process.stdout.write(`**Download:** [decompbuddy.com/download](https://decompbuddy.com/download) - Mac (Apple Silicon + Intel, signed and notarized), Windows (installer or portable), Linux (AppImage or .deb).\n\n${v.notes.en}\n\nEvery version: [decompbuddy.com/changelog](https://decompbuddy.com/changelog)\n`);
} else {
  console.error("usage: changelog.mjs check <version> | stamp <version> <date> | site <file> | github <version>");
  process.exit(1);
}
