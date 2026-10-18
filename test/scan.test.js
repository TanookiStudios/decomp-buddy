import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanKey, pickRelease, applyScans, scanSummary } from "../src/scan.js";
import { download } from "../src/setup.js";

const build = (asset, tag = "v1") => ({ method: "release", release_asset: asset, release_tag: tag });
const plansOf = (...builds) => ({ plans: { "github:a/b": { tag: "v1", targets: { windows: { games: builds.map((b, i) => ({ game_title: `G${i}`, build: b })) } } } } });

test("pickRelease: the plan's tag when it has the file, else any release that does", () => {
  const rels = [{ tag: "v2", assets: [{ name: "g.zip", url: "u2" }] }, { tag: "v1", assets: [{ name: "g.zip", url: "u1" }] }];
  assert.equal(pickRelease(rels, build("g.zip", "v1")).asset.url, "u1");
  assert.equal(pickRelease(rels, build("g.zip", "gone")).release.tag, "v2");
  assert.equal(pickRelease(rels, build("other.zip")).asset, null);
});

test("applyScans marks clean files with their fingerprint, blocks flagged ones, and clears stale marks", () => {
  const ok = build("ok.zip"), bad = build("bad.zip"), none = build("new.zip");
  none.scanned = { sha256: "old" }; // a previous result that no longer has a record
  const plans = plansOf(ok, bad, none);
  const scans = { files: {
    [scanKey("github:a/b", ok)]: { sha256: "aa", clean: true, at: "2026-10-18", engine: "ClamAV" },
    [scanKey("github:a/b", bad)]: { sha256: "bb", clean: false, signature: "Win.Trojan.X", at: "2026-10-18", engine: "ClamAV" },
  } };
  assert.equal(applyScans(plans, scans), 2);
  assert.deepEqual(ok.scanned, { sha256: "aa", at: "2026-10-18", engine: "ClamAV" });
  assert.equal(bad.scanned.flagged, true); assert.equal(bad.scanned.signature, "Win.Trojan.X");
  assert.equal(none.scanned, undefined);
  // A flagged file reviewed by hand and cleared counts as clean.
  applyScans(plans, scans, { bb: { reason: "false positive: libc++ thread symbols" } }); assert.equal(bad.scanned.sha256, "bb");
  // Reviewed by fingerprint: a different file under the same name stays blocked.
  scans.files[scanKey("github:a/b", bad)].sha256 = "cc";
  applyScans(plans, scans, { bb: { reason: "x" } }); assert.equal(bad.scanned.flagged, true);
});

test("scanSummary: badge only when every download in the plan is scanned clean", () => {
  const a = build("a.zip"), b = build("b.zip");
  const entry = plansOf(a, b).plans["github:a/b"];
  assert.equal(scanSummary(entry), null);
  a.scanned = { sha256: "1", at: "2026-10-18T02", engine: "ClamAV" };
  assert.equal(scanSummary(entry), null);
  b.scanned = { sha256: "2", at: "2026-10-17T09", engine: "ClamAV" };
  assert.deepEqual(scanSummary(entry), { at: "2026-10-17T09", engine: "ClamAV", files: 2 });
  b.scanned = { flagged: true };
  assert.deepEqual(scanSummary(entry), { flagged: true });
  assert.equal(scanSummary({ targets: { windows: { games: [{ build: { method: "source" } }] } } }), null);
});

test("download refuses a file that changed after it was scanned", async () => {
  const s = http.createServer((_q, res) => res.end("swapped bytes"));
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "scan-")), "g.zip");
  try {
    await assert.rejects(download(`http://127.0.0.1:${s.address().port}/g.zip`, dest, () => {}, { digest: `sha256:${"0".repeat(64)}`, scanned: true }), /changed since Decomp Buddy scanned it/);
  } finally { s.close(); }
  assert.equal(fs.existsSync(dest), false); assert.equal(fs.existsSync(`${dest}.part`), false);
});
