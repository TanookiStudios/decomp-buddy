import { test } from "node:test";
import assert from "node:assert/strict";
import { problems } from "../scripts/triage.mjs";

test("triage answers: play needs a desktop download, every repo answered once, known consoles only", () => {
  const ctx = { "a/port": { platforms: ["Windows"] }, "b/decomp": { platforms: [] }, "c/tool": { platforms: ["Android"] } };
  const ctxOf = (r) => ctx[r.toLowerCase()];
  const ok = { results: [
    { repo: "a/port", verdict: "play", title: "Game", console: "Xbox", reason: "Windows build" },
    { repo: "b/decomp", verdict: "soon", title: "Game 2", console: "Nintendo 64", reason: "ROM decomp" },
    { repo: "c/tool", verdict: "hide", title: "tool", console: "", reason: "Android only" },
  ] };
  assert.deepEqual(problems(ok, ["a/port", "b/decomp", "c/tool"], ctxOf), []);
  const bad = { results: [
    { repo: "b/decomp", verdict: "play", title: "Game 2", console: "N64", reason: "" },
    { repo: "x/stray", verdict: "maybe", title: "", console: "Xbox", reason: "" },
  ] };
  const p = problems(bad, ["a/port", "b/decomp"], ctxOf).join("\n");
  for (const want of [/b\/decomp: console "N64"/, /b\/decomp: "play" needs/, /x\/stray: verdict/, /x\/stray: title is empty/, /a\/port: missing/, /x\/stray: not in this batch/]) assert.match(p, want);
});
