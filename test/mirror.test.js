import test from "node:test";
import assert from "node:assert/strict";
import { applyMirror, fileUrl } from "../src/mirror.js";

const SHA = "a".repeat(64), OLD = "b".repeat(64);
const plans = () => ({ plans: { "github:o/r": { tag: "v2", targets: { windows: { games: [{ build: { method: "release", release_tag: "v2", release_asset: "g v2.zip", scanned: { sha256: SHA, size: 5 }, previous: { release_tag: "v1", release_asset: "g.zip", scanned: { sha256: OLD } } } }] } } } } });

test("mirror: only builds whose exact file is in the ledger are marked as ours", () => {
  const p = plans();
  assert.equal(applyMirror(p, { files: { [SHA]: { key: `${SHA}/g v2.zip` } } }), 1);
  const b = p.plans["github:o/r"].targets.windows.games[0].build;
  assert.equal(b.mirror, true); assert.equal(b.previous.mirror, undefined);
  applyMirror(p, { files: {} }); assert.equal(b.mirror, undefined); // a file taken down stops being offered
});

test("mirror: the newest saved source zip is attached to its project", () => {
  const p = plans();
  applyMirror(p, { other: { "source/github/o/r/v1.zip": { kind: "source", repo: "github:o/r", tag: "v1", size: 3, at: "2026-11-01" }, "source/github/o/r/v2.zip": { kind: "source", repo: "github:o/r", tag: "v2", size: 4, at: "2026-11-13" } } });
  assert.deepEqual(p.plans["github:o/r"].source, { url: "https://files.decompbuddy.com/source/github/o/r/v2.zip", tag: "v2", size: 4 });
  assert.equal(fileUrl(SHA, "g v2.zip"), `https://files.decompbuddy.com/${SHA}/g%20v2.zip`);
});
