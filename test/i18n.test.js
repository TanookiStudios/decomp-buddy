import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const en = Object.keys(JSON.parse(fs.readFileSync("renderer/i18n/en.json", "utf8")).strings);
const ph = (s) => [...s.matchAll(/\{\d\}/g)].map((m) => m[0]).sort().join(",");
for (const code of ["pt-BR", "es", "fr", "de", "ja"]) {
  test(`${code}: every English string has a translation with the same placeholders`, () => {
    const t = JSON.parse(fs.readFileSync(`renderer/i18n/${code}.json`, "utf8")).strings;
    const missing = en.filter((s) => !(s in t));
    assert.deepEqual(missing, [], `run node scripts/i18n-translate.mjs ${code}`);
    for (const s of en) assert.equal(ph(t[s]), ph(s), `${code}: "${s}" -> "${t[s]}"`);
  });
}
test("en.json is current with the renderer (run node scripts/i18n-extract.mjs after UI text changes)", async () => {
  const before = fs.readFileSync("renderer/i18n/en.json", "utf8");
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["scripts/i18n-extract.mjs"], { stdio: "ignore" });
  const after = fs.readFileSync("renderer/i18n/en.json", "utf8");
  fs.writeFileSync("renderer/i18n/en.json", before);
  assert.equal(JSON.parse(after)._meta.strings, JSON.parse(before)._meta.strings);
});
