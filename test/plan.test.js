import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { PLAN_JSON_SCHEMA, extractJson, planViaOpenAICompatible, askStructured, listModels } from "../src/plan.js";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UA = /^DecompBuddy(\/\d+\.\d+\.\d+)? \(\+https:\/\/decompbuddy\.com\)$/;

test("every analysis request carries the DecompBuddy User-Agent and one session, retries included", async () => {
  const calls = [];
  const sessionId = "11111111-1111-4111-8111-111111111111";
  let n = 0;
  const fetchImpl = async (_url, init) => {
    calls.push(init);
    return reply(n++ === 0 ? '{"games": [{"game_title": 5}]}' : JSON.stringify({ redirect_repo: null, games: [goodPlan] }));
  };
  const provider = resolveProvider("groq", { apiKey: "k", model: "m" });
  const analysis = await planViaOpenAICompatible(ctx, provider, () => {}, { fetchImpl, sessionId });
  assert.equal(analysis.games[0].game_title, "Skate 3");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(call.headers["User-Agent"], UA);
    assert.equal(call.headers["x-opencode-session"], sessionId, "the retry keeps the analysis's session");
  }
});

test("a plan made without a supplied session gets one UUID and keeps it for the retry", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => { calls.push(init); return reply('{"games": [{"game_title": 5}]}'); };
  const provider = resolveProvider("groq", { apiKey: "k", model: "m" });
  await assert.rejects(planViaOpenAICompatible(ctx, provider, () => {}, { fetchImpl }), /could not produce a valid plan/);
  await assert.rejects(planViaOpenAICompatible(ctx, provider, () => {}, { fetchImpl }), /could not produce a valid plan/);
  assert.match(calls[0].headers["x-opencode-session"], UUID);
  assert.equal(calls[1].headers["x-opencode-session"], calls[0].headers["x-opencode-session"]);
  assert.notEqual(calls[2].headers["x-opencode-session"], calls[0].headers["x-opencode-session"], "a different analysis gets its own session");
  assert.equal(calls[3].headers["x-opencode-session"], calls[2].headers["x-opencode-session"]);
});

test("structured questions keep the same session on their second (secondary) request", async () => {
  const calls = [];
  const sessionId = "22222222-2222-4222-8222-222222222222";
  let n = 0;
  const fetchImpl = async (_url, init) => {
    calls.push(init);
    return reply(n++ === 0 ? '{"answer": 5}' : '{"answer": "ok"}');
  };
  const provider = resolveProvider("groq", { apiKey: "k", model: "m" });
  const out = await askStructured(provider, { system: "s", user: "u", schema: z.object({ answer: z.string() }), fetchImpl, sessionId });
  assert.equal(out.answer, "ok");
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(call.headers["User-Agent"], UA);
    assert.equal(call.headers["x-opencode-session"], sessionId);
  }
});

test("listing models (a non-analysis request) still sends the DecompBuddy User-Agent and a session", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => { calls.push(init); return new Response(JSON.stringify({ data: [{ id: "b" }, { id: "a" }] }), { status: 200 }); };
  const ids = await listModels(resolveProvider("groq", { apiKey: "k", model: "m" }), { fetchImpl });
  assert.deepEqual(ids, ["a", "b"]);
  assert.match(calls[0].headers["User-Agent"], UA);
  assert.match(calls[0].headers["x-opencode-session"], UUID);
  assert.equal(calls[0].headers.Authorization, "Bearer k");
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
