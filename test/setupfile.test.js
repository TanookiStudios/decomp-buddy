import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExport, mergeImport } from "../src/setupfile.js";

const mine = { theme: "dark", providers: { claude: { apiKeyEnc: "SECRET", model: "claude-haiku-5-5" } }, github: { apiKeyEnc: "GH" }, localFinds: [{ repo: "A/one" }], wishlist: { x: { addedAt: "1" } } };

test("export carries preferences and pending finds, never keys", () => {
  const f = buildExport(mine, { version: "0.24.0" });
  const text = JSON.stringify(f);
  assert.ok(!text.includes("SECRET") && !text.includes("GH"));
  assert.equal(f.settings.providers.claude.model, "claude-haiku-5-5");
  assert.equal(f.settings.localFinds.length, 1);
});

test("import merges: lists gain what's missing, nothing here is overwritten", () => {
  const file = buildExport({ theme: "light", target: "linux", localFinds: [{ repo: "a/ONE" }, { repo: "B/two" }], wishlist: { y: {} } }, { version: "0.24.0" });
  const r = mergeImport(mine, file);
  assert.equal(r.settings.theme, "dark");            // mine wins
  assert.equal(r.settings.target, "linux");          // filled in, I had none
  assert.deepEqual(r.settings.localFinds.map((f) => f.repo), ["A/one", "B/two"]); // case-insensitive dedupe
  assert.equal(r.settings.providers.claude.apiKeyEnc, "SECRET"); // my key untouched
  assert.deepEqual(r.added, { localFinds: 1, wishlist: 1 });
  assert.throws(() => mergeImport(mine, { kind: "other" }), /isn't a Decomp Buddy setup file/);
});
