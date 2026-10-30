// What's New: after an upgrade, the release notes for every version since the one you had (in your language),
// once. Any time from the menu: every version. The notes ship inside the app (docs/releases), so it works offline.
import { ipcMain } from "electron";
import path from "node:path";
import { here, VERSION, loadSettings, saveSettings } from "./core.js";
import { readChangelog, sinceLastSeen, LANGS } from "../changelog.js";
import { renderMarkdown } from "../readme.js";

const log = () => readChangelog(path.join(here, "docs", "releases"));
const show = (versions, lang) => versions.map((v) => ({ version: v.version, date: v.date, html: renderMarkdown(v.notes[LANGS.includes(lang) && v.notes[lang] ? lang : "en"]) }));

ipcMain.handle("whatsnew:get", (_e, { lang, all } = {}) => {
  const l = log(), since = loadSettings().whatsNewSince;
  if (all) return show(sinceLastSeen(l, null, VERSION), lang);
  if (since === undefined) return []; // a fresh install, or already seen
  // since null: upgraded from a version too old to say which - just this one's notes.
  return show(since === null ? l.versions.filter((v) => v.version === VERSION) : sinceLastSeen(l, since, VERSION), lang);
});
ipcMain.handle("whatsnew:seen", () => { const s = loadSettings(); delete s.whatsNewSince; saveSettings(s); return true; });
