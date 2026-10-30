import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readChangelog, checkVersion, sinceLastSeen, LANGS } from "../src/changelog.js";

const EN = "## New\n- One\n- Two\n## Removed\n- Three\n";
function folder(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relnotes-"));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}
const full = (v, en = EN, extra = {}) => Object.fromEntries([[`${v}.md`, en], ...LANGS.slice(1).map((l) => [`${v}.${l}.md`, en.replace(/New/g, "Nuevo")]), ...Object.entries(extra)]);

test("reads versions newest first, with release dates and every language", () => {
  const log = readChangelog(folder({ ...full("0.9.10", `<!-- released: 2026-10-26 -->\n${EN}`), ...full("0.10.0") }));
  assert.deepEqual(log.versions.map((v) => v.version), ["0.10.0", "0.9.10"]);
  assert.equal(log.versions[1].date, "2026-10-26");
  assert.equal(log.versions[0].date, null);
  assert.equal(Object.keys(log.versions[0].notes).length, 6);
  assert.ok(!log.versions[1].notes.en.includes("released"));
});

test("a complete version passes", () => assert.deepEqual(checkVersion(readChangelog(folder(full("1.0.0"))), "1.0.0"), []));

test("refuses a release with no notes", () => assert.match(checkVersion(readChangelog(folder({})), "1.0.0")[0], /1\.0\.0\.md is missing/));

test("refuses a missing or out-of-date translation", () => {
  const files = full("1.0.0"); delete files["1.0.0.ja.md"]; files["1.0.0.de.md"] = "## Neu\n- Eins\n";
  const p = checkVersion(readChangelog(folder(files)), "1.0.0").join(" ");
  assert.match(p, /1\.0\.0\.ja\.md is missing/);
  assert.match(p, /1\.0\.0\.de\.md has 1 sections and 1 bullets; English has 2 and 3/);
});

test("refuses headings outside New / Better / Fixed / Removed", () => {
  assert.match(checkVersion(readChangelog(folder(full("1.0.0", "## The big one\n- One\n"))), "1.0.0")[0], /The big one/);
});

test("What's New shows every version since the last one seen, up to this one", () => {
  const log = readChangelog(folder({ ...full("1.0.0"), ...full("1.1.0"), ...full("1.2.0"), ...full("1.3.0") }));
  assert.deepEqual(sinceLastSeen(log, "1.0.0", "1.2.0").map((v) => v.version), ["1.2.0", "1.1.0"]);
  assert.deepEqual(sinceLastSeen(log, "1.2.0", "1.2.0"), []);
  assert.deepEqual(sinceLastSeen(log, null, "1.1.0").map((v) => v.version), ["1.1.0", "1.0.0"]);
});

test("the real notes in docs/releases are complete for every released version", () => {
  const log = readChangelog(path.join(import.meta.dirname, "..", "docs", "releases"));
  for (const v of log.versions) assert.deepEqual(checkVersion(log, v.version), [], v.version);
});
