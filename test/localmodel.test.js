import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { detect, pull, testModel } from "../src/localmodel.js";

const plan = { redirect_repo: null, games: [{ game_title: "Test Game", console: "Nintendo 64", build: { method: "release", release_asset: "TestPort-Windows.zip", release_tag: "v1.0.0", build_steps: [], required_tools: [], executable: "testport.exe" }, game_files: [{ label: "ROM", description: "US ROM", kind: "game", accepted_formats: [".z64"], expected_filename: "baserom.z64", how_provided: "folder", drop_into: "", notes: "", expected_region: "USA", required_version: null, expected_hashes: [], expected_size: null, expected_serial: null }], first_run: [], notes: [], confidence: "high", unsure: [], artwork_url: null, mods_method: "none", mods_folder: null, mods_formats: [], mods_notes: "" }] };
function fakeOllama({ answer = plan, pullOk = true } = {}) {
  const s = http.createServer(async (req, res) => {
    if (req.url === "/api/tags") return res.end(JSON.stringify({ models: [{ name: "qwen2.5:7b-instruct", size: 4.7e9 }] }));
    if (req.url === "/api/pull") { res.write(JSON.stringify({ status: "pulling manifest" }) + "\n"); res.write(JSON.stringify({ status: "downloading", completed: 50, total: 100 }) + "\n"); res.end(JSON.stringify(pullOk ? { status: "success" } : { error: "model not found" }) + "\n"); return; }
    if (req.url === "/v1/chat/completions") return res.end(JSON.stringify({ choices: [{ message: { content: "```json\n" + JSON.stringify(answer) + "\n```" } }] }));
    res.statusCode = 404; res.end();
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ s, base: `http://127.0.0.1:${s.address().port}` })));
}

test("local model: detect, pull with progress, and the canned-repo test passes only on the right answer", async () => {
  assert.deepEqual(await detect({ base: "http://127.0.0.1:9" }), { running: false });
  const { s, base } = await fakeOllama();
  try {
    assert.equal((await detect({ base })).models[0].name, "qwen2.5:7b-instruct");
    const seen = []; await pull("qwen2.5:7b-instruct", { base, onProgress: (p) => seen.push(p.pct) }); assert.ok(seen.includes(50));
    const r = await testModel("qwen2.5:7b-instruct", { base }); assert.equal(r.ok, true);
  } finally { s.close(); }
  const wrong = structuredClone(plan); wrong.games[0].build.release_asset = "TestPort-Linux.tar.gz";
  const b = await fakeOllama({ answer: wrong, pullOk: false });
  try { assert.equal((await testModel("m", { base: b.base })).ok, false); await assert.rejects(pull("m", { base: b.base }), /model not found/); } finally { b.s.close(); }
});
