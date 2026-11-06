import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const afterPack = createRequire(import.meta.url)("../scripts/after-pack.cjs").default;

test("after-pack: 7za can run in a packaged Linux or Mac app, and a build without one stops", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "after-pack-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(afterPack({ appOutDir: dir, electronPlatformName: "linux" }), /no 7za/);
  const seven = path.join(dir, "resources", "7zip-bin", "linux", "x64", "7za");
  fs.mkdirSync(path.dirname(seven), { recursive: true });
  fs.writeFileSync(seven, "", { mode: 0o644 });
  await afterPack({ appOutDir: dir, electronPlatformName: "linux" });
  assert.equal(fs.statSync(seven).mode & 0o111, 0o111);
});
