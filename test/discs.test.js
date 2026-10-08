import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sortDiscs, discCandidates } from "../src/discs.js";

test("sortDiscs: disc numbers in names go to the matching rows; .bin beside a .cue isn't a disc", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "discs-"));
  for (const n of ["Game (Disc 2).cue", "Game (Disc 2).bin", "Game (Disc 1).cue", "Game (Disc 1).bin", "readme.txt"]) fs.writeFileSync(path.join(d, n), "x");
  assert.equal(discCandidates(d).length, 2);
  const r = sortDiscs(d, [{ label: "Disc 1 image" }, { label: "Disc 2 image" }, { label: "BIOS", kind: "bios" }]);
  assert.equal(path.basename(r.assignments[0]), "Game (Disc 1).cue");
  assert.equal(path.basename(r.assignments[1]), "Game (Disc 2).cue");
  assert.equal(r.assignments[2], undefined);
  assert.equal(r.how[0], "disc number");
});

test("sortDiscs: unlabeled rows fall back to name order and leftovers are reported", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "discs-"));
  for (const n of ["b.iso", "a.iso", "c.iso"]) fs.writeFileSync(path.join(d, n), "x");
  const r = sortDiscs(d, [{ label: "First" }, { label: "Second" }]);
  assert.deepEqual([r.assignments[0], r.assignments[1]].map((p) => path.basename(p)), ["a.iso", "b.iso"]);
  assert.deepEqual(r.unmatched.map((p) => path.basename(p)), ["c.iso"]);
});
