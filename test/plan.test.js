import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN_JSON_SCHEMA, extractJson, planViaOpenAICompatible } from "../src/plan.js";
import { resolveProvider, PRESETS } from "../src/providers.js";

const goodPlan = {
  game_title: "Skate 3", console: "Xbox 360",
  build: { method: "release", release_asset: "Skate3Recomp-Windows.zip", release_tag: null, build_steps: [], required_tools: [], executable: "skate3.exe" },
  game_files: [], first_run: [], notes: [], confidence: "high", unsure: [], artwork_url: null, mods_method: "none", mods_folder: null, mods_formats: [], mods_notes: "",
};
const ctx = { fullName: "x/y", url: "u", description: "", homepage: "", defaultBranch: "main", releases: [], tree: [], treeTruncated: false, readme: "hi", docs: [] };
const reply = (content) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

test("JSON schema is strict-mode shaped", () => {
  assert.equal(PLAN_JSON_SCHEMA.additionalProperties, false);
  assert.deepEqual(PLAN_JSON_SCHEMA.required.sort(), Object.keys(PLAN_JSON_SCHEMA.properties).sort());
  assert.equal(PLAN_JSON_SCHEMA.properties.games.items.properties.build.additionalProperties, false);
});

test("extractJson survives fences and prose", () => {
  assert.deepEqual(extractJson('Sure! ```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => extractJson("no json here"), /No JSON/);
});

test("openai kind sends strict json_schema and parses the plan", async () => {
  let body;
  const fetchImpl = async (_url, init) => { body = JSON.parse(init.body); return reply(JSON.stringify({ redirect_repo: null, games: [goodPlan] })); };
  const provider = resolveProvider("openai", { apiKey: "k", model: "m" });
  const analysis = await planViaOpenAICompatible(ctx, provider, () => {}, { fetchImpl });
  assert.equal(analysis.games[0].game_title, "Skate 3");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.model, "m");
});

test("compatible kind retries once with the validation errors, then gives up", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => { calls.push(JSON.parse(init.body)); return reply('{"games": [{"game_title": 5}]}'); };
  const provider = resolveProvider("groq", { apiKey: "k", model: "m" });
  await assert.rejects(planViaOpenAICompatible(ctx, provider, () => {}, { fetchImpl }), /could not produce a valid plan/);
  assert.equal(calls.length, 2);
  assert.match(calls[1].messages.at(-1).content, /did not validate/);
  assert.equal(calls[0].response_format, undefined);
  assert.match(calls[0].messages[0].content, /JSON Schema/);
});

test("resolveProvider fills preset defaults and refuses missing key/model", () => {
  assert.equal(resolveProvider("claude", { apiKey: "k" }).model, "claude-haiku-5-5");
  assert.equal(resolveProvider("ollama", { model: "llama3" }).apiKey, "");
  assert.throws(() => resolveProvider("openai", { model: "m" }), /API key/);
  assert.throws(() => resolveProvider("openai", { apiKey: "k" }), /choose a model/);
  assert.throws(() => resolveProvider("custom", { apiKey: "k", model: "m" }), /base URL/);
  assert.equal(PRESETS.gemini.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
});

test("Claude refusing the schema as too large falls back to plain JSON, checked here (the error a user hit on 0.30)", async () => {
  const http = await import("node:http");
  const { planFromContext } = await import("../src/plan.js");
  const seen = [];
  const server = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      const body = JSON.parse(b); seen.push(body.output_config ? "schema" : "plain");
      res.setHeader("content-type", "application/json");
      if (body.output_config) { res.statusCode = 400; return res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools." } })); }
      res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "x", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ redirect_repo: null, games: [goodPlan] }) }], usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const provider = resolveProvider("claude", { apiKey: "k", model: "claude-sonnet-5-5", baseUrl: `http://127.0.0.1:${server.address().port}/v1` });
    const out = await planFromContext(ctx, { provider, log: () => {} });
    const games = out.games || [out];
    assert.equal(games[0].game_title, "Skate 3");
    assert.deepEqual(seen, ["schema", "plain"]);
  } finally { server.close(); }
});
