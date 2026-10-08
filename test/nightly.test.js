import { test } from "node:test";
import assert from "node:assert/strict";
import { pickArtifacts } from "../src/nightly.js";

const a = (name, branch, created, extra = {}) => ({ id: Math.random(), name, size_in_bytes: 1, expired: false, created_at: created, workflow_run: { head_branch: branch }, ...extra });
test("pickArtifacts: right platform, default branch first, release before debug, flatpak last, expired gone", () => {
  const list = [
    a("Game-Windows-Debug", "main", "2026-09-03"), a("Game-Windows-Release", "main", "2026-09-02"), a("Game-Windows-Release", "feature", "2026-09-05"),
    a("Game-Linux-Release", "main", "2026-09-04"), a("Game-Linux-Flatpak", "main", "2026-09-06"), a("Game-Windows-Release", "main", "2026-09-06", { expired: true }), a("Game-macOS-arm64", "main", "2026-09-01"),
  ];
  const w = pickArtifacts(list, "windows", "main");
  assert.deepEqual(w.map((x) => `${x.name}@${x.branch}`), ["Game-Windows-Release@main", "Game-Windows-Debug@main", "Game-Windows-Release@feature"]);
  assert.deepEqual(pickArtifacts(list, "linux", "main").map((x) => x.name), ["Game-Linux-Release", "Game-Linux-Flatpak"]);
  assert.deepEqual(pickArtifacts(list, "macos-arm64", "main").map((x) => x.name), ["Game-macOS-arm64"]);
});
