// Asks an LLM to read the repo and produce a setup plan we can execute.
// Claude gets native structured output; any OpenAI-compatible API gets a
// JSON schema and validated JSON with one retry.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { targetOf } from "./targets.js";

export const GameFile = z.object({
  label: z.string().describe("Short name, e.g. 'Skate 3 disc image'"),
  description: z.string().describe("What the user must supply and where it comes from (their own legal copy)"),
  accepted_formats: z.array(z.string()).describe("File extensions/formats accepted, e.g. ['.iso', '.gcm']"),
  expected_filename: z.string().nullable().describe("Exact filename if the project requires one, else null"),
  how_provided: z.enum(["folder", "in_app_picker", "command_line"]).describe(
    "folder: copy into a specific folder. in_app_picker: the app asks for the file on first run. command_line: passed as an argument/tool step"
  ),
  drop_into: z.string().describe("Folder path relative to the game folder where the file should go. Use 'Game Files' when how_provided is not 'folder'"),
  notes: z.string().nullable(),
  kind: z.enum(["game", "bios", "update", "dlc", "other"]).describe("game: the ROM/disc image. bios: a console system file (e.g. GBA BIOS, PS1 BIOS). update/dlc: title updates or DLC packages"),
  expected_region: z.enum(["USA", "Europe", "Japan", "any", "unknown"]).describe("Region the project requires, if the docs say (e.g. 'USA version only'); 'any' if it supports all; 'unknown' if not stated"),
  required_version: z.string().nullable().describe("Version/revision the docs require, copied verbatim (e.g. 'v1.0', 'Rev A', 'Title Update 3'), else null"),
  expected_hashes: z.array(z.object({
    algo: z.enum(["sha1", "md5", "sha256", "crc32"]),
    value: z.string().describe("Lowercase hex, exactly as printed in the docs"),
  })).describe("Checksums the docs publish for this file. ONLY values literally present in the repo docs/files - never invent one. Empty if none"),
  expected_size: z.number().nullable().describe("Exact size in bytes if the docs state it, else null"),
  expected_serial: z.string().nullable().describe("Disc serial the project requires (e.g. 'SLUS-01156' for PlayStation), copied exactly from the docs or catalog, else null"),
});

export const Plan = z.object({
  game_title: z.string().describe("Official game title, e.g. 'Super Mario Strikers'"),
  console: z.string().describe("Full original platform name, e.g. 'Nintendo GameCube', 'Xbox 360', 'Nintendo 64'"),
  build: z.object({
    method: z.enum(["release", "source", "web_only", "unsupported"]).describe(
      "release: a prebuilt download for the TARGET PLATFORM exists in the release assets. source: must be built on the target machine. web_only: runs only in a browser. unsupported: no path for the target platform"
    ),
    release_asset: z.string().nullable().describe("EXACT asset filename from the release asset lists for the TARGET PLATFORM, else null"),
    release_tag: z.string().nullable().describe("EXACT tag of the release that contains release_asset, else null"),
    build_steps: z.array(z.string()).describe("Ordered steps to build on the target machine when method is source; empty otherwise"),
    required_tools: z.array(z.string()).describe("Tools the target machine needs (e.g. 'Visual Studio 2022', 'CMake 3.25+'); empty if none beyond the download"),
    executable: z.string().nullable().describe("Name of the program to run once set up (exe, .app, or binary), if known"),
  }),
  game_files: z.array(GameFile).describe("Every file the user must supply from their own copy of the game. At least one unless truly none"),
  first_run: z.array(z.string()).describe("What to do the first time, in order, after game files are in place"),
  notes: z.array(z.string()).describe("Gotchas worth knowing: required updates/DLC/title updates, region, known issues"),
  confidence: z.enum(["high", "medium", "low"]),
  unsure: z.array(z.string()).describe("Anything the docs did not make clear"),
  artwork_url: z.string().nullable().describe("A representative image for THIS game from the README - a logo or gameplay screenshot - as the exact URL or repo-relative path used in the README (e.g. 'docs/screenshots/sm1.png'); null if the README has none"),
  mods_method: z.enum(["none", "folder", "in_app", "drag_onto_window", "unknown"]).describe("How this port takes mods/texture packs per the docs. none: docs don't mention mods. folder: files go in a folder the docs name. in_app: an Install Mods button / mod menu in the game. drag_onto_window: drop files on the game window. unknown: supported but the docs don't say how"),
  mods_folder: z.string().nullable().describe("The mods folder relative to the game folder when mods_method is 'folder' (e.g. 'mods'), else null"),
  mods_formats: z.array(z.string()).describe("File extensions mods/texture packs come in, e.g. ['.nrm', '.rtz', '.otr']; empty if none"),
  mods_notes: z.string().describe("The docs' own words on installing mods/texture packs, or empty"),
});

export const Analysis = z.object({
  redirect_repo: z.string().nullable().describe(
    "owner/repo if THIS repo is not the one to install from (e.g. it's a web build or mirror and the README points at the real project), else null"
  ),
  games: z.array(Plan).describe("One entry per distinct game this repo ships. Most repos have exactly one; a repo with separate packages/executables for several games gets one entry each"),
});

export const PLAN_JSON_SCHEMA = z.toJSONSchema(Analysis);

export const SYSTEM = `You are Decomp Buddy. You read the GitHub repository of a game decompilation, recompilation, or native port and produce a precise, honest setup plan for the TARGET PLATFORM named in the request.

Rules:
- Use only what the repo docs say. If something is not stated, put it in "unsure" rather than guessing.
- The user will supply game files from their own legally owned copy. Never suggest where to obtain game files otherwise.
- A repo may ship SEVERAL games (separate release packages or executables, e.g. "Spider-Man" and "Spider-Man 2"). Return one entry in "games" per distinct game, each with its own release asset. Tools, mods, add-ons, and source archives are not games.
- "release_asset" and "release_tag" must be copied EXACTLY from the release lists, choosing the build for the TARGET PLATFORM (never another OS or CPU). If there is no asset for it, method is "source" (if buildable there), "web_only", or "unsupported".
- For each game file, give the exact expected filename when the project requires one, and the exact folder it must be placed in, relative to the folder the release was extracted into. If the app has its own file picker on first run, set how_provided to "in_app_picker" and drop_into to "Game Files".
- "console" is the full original platform name (e.g. "Nintendo GameCube", not "GC").
- Verification data: copy any checksums (sha1/md5/crc32/sha256), required region, version/revision, and file size EXACTLY as the docs or checksum files state them. Never invent or recall a hash - if the docs don't give one, leave expected_hashes empty.
- If the project needs console system files (BIOS, firmware), list each as its own game file with kind "bios", with the exact filename it must have.
- mods_*: report exactly what the docs say about mods and texture packs - method, folder, formats; put any mod/texture-pack URLs from the docs in mods_notes. If they say nothing, mods_method="none".
- "artwork_url": pick one image the README shows for this game (logo first, else a gameplay screenshot), copying its path/URL exactly. Badges, shields, and GIFs don't count.
- If this repo is only a web build, mirror, or launcher and the README points at the real project repo, set redirect_repo to that owner/repo.`;

export function renderContext(ctx, { preferredTag, preferredAsset, target = "windows", hints } = {}) {
  const t = targetOf(target);
  const parts = [
    `TARGET PLATFORM: ${t.prompt}`,
    `# Repository: ${ctx.fullName}`,
    `URL: ${ctx.url}`,
    preferredTag && `The catalog lists release tag "${preferredTag}" as the version to install: pick the ${t.prompt} asset from that release (set release_tag to it) unless that release has no such asset. This applies only if the repository ships ONE game; if its releases are one-per-game, ignore this tag.`,
    preferredAsset && `The catalog says the ${t.prompt} asset is "${preferredAsset}".`,
    hints && `Catalog facts about the required game files (copy into the plan): ${hints}.`,
    ctx.description && `Description: ${ctx.description}`,
    ctx.homepage && `Homepage: ${ctx.homepage}`,
    `Default branch: ${ctx.defaultBranch}`,
    "",
    "## Releases (newest first)",
    "If different releases are different games (a collection: each tag or asset is named after another game), this repository ships several games - return one entry per game, each with its own release_tag and release_asset, and don't stop at the newest one.",
    ctx.releases.length
      ? ctx.releases.map((r) => [`### Tag: ${r.tag} (${r.name}) published ${r.publishedAt}`, ...r.assets.map((a) => `- ${a.name} (${Math.round(a.size / 1_048_576)} MB)`)].join("\n")).join("\n")
      : "No releases published.",
    "",
    "## File tree" + (ctx.treeTruncated ? " (truncated)" : ""),
    ctx.tree.join("\n"),
    "",
    "## README",
    ctx.readme || "(none)",
    ...ctx.docs.flatMap((d) => ["", `## ${d.path}`, d.text]),
  ];
  return parts.filter((p) => p !== undefined && p !== false).join("\n");
}

// Pull the outermost JSON object out of a model reply that may have prose or code fences around it.
export function extractJson(text) {
  const s = String(text).replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{"), end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in the reply.");
  return JSON.parse(s.slice(start, end + 1));
}

async function readError(res, label) {
  let msg = res.statusText;
  try { const j = await res.json(); msg = j.error?.message || j.error || j.detail || j.message || JSON.stringify(j); } catch {}
  return new Error(`${label} ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
}

// One chat completion against any OpenAI-compatible endpoint. Returns the assistant text.
async function chatCompletion(provider, messages, { responseFormat, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}) },
    body: JSON.stringify({ model: provider.model, messages, ...(responseFormat ? { response_format: responseFormat } : {}) }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw await readError(res, provider.label);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) throw new Error(`${provider.label} returned no text (model ${provider.model}).`);
  return content;
}

async function planViaClaude(ctx, provider, log, opts) {
  const client = new Anthropic({ apiKey: provider.apiKey, baseURL: provider.baseUrl.replace(/\/v1$/, "") });
  const response = await client.messages.parse({
    model: provider.model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: renderContext(ctx, opts) }],
    output_config: { format: zodOutputFormat(Analysis) },
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to analyse this repo.");
  if (!response.parsed_output) throw new Error("Claude's plan did not match the expected shape.");
  return response.parsed_output;
}

// OpenAI: strict JSON schema. Compatible: schema in the prompt, validate, retry once with the errors.
export async function planViaOpenAICompatible(ctx, provider, log, { fetchImpl, ...opts } = {}) {
  const strict = provider.kind === "openai";
  const system = strict ? SYSTEM : `${SYSTEM}\n\nReply with ONLY a JSON object matching this JSON Schema, no prose, no code fences:\n${JSON.stringify(PLAN_JSON_SCHEMA)}`;
  const messages = [{ role: "system", content: system }, { role: "user", content: renderContext(ctx, opts) }];
  const responseFormat = strict ? { type: "json_schema", json_schema: { name: "plan", strict: true, schema: PLAN_JSON_SCHEMA } } : undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await chatCompletion(provider, messages, { responseFormat, fetchImpl });
    let parsed;
    try { parsed = Analysis.safeParse(extractJson(text)); }
    catch (err) { parsed = { success: false, error: { message: err.message } }; }
    if (parsed.success) return parsed.data;
    const problems = parsed.error.issues ? parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : parsed.error.message;
    if (attempt === 1) throw new Error(`${provider.label} (${provider.model}) could not produce a valid plan: ${problems}. Try a more capable model.`);
    log(`  ${provider.label} reply didn't validate (${problems}) - asking once more.`);
    messages.push({ role: "assistant", content: text }, { role: "user", content: `That did not validate: ${problems}. Reply again with ONLY the corrected JSON object.` });
  }
}

// Any structured question, any provider: Claude via parse(), OpenAI strict schema, others schema-in-prompt + one retry.
export async function askStructured(provider, { system, user, schema, name = "answer", maxTokens = 4000, log = () => {} }) {
  if (provider.kind === "claude") {
    const client = new Anthropic({ apiKey: provider.apiKey, baseURL: provider.baseUrl.replace(/\/v1$/, "") });
    const r = await client.messages.parse({ model: provider.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }], output_config: { format: zodOutputFormat(schema) } });
    if (r.stop_reason === "refusal") throw new Error("Claude declined.");
    if (!r.parsed_output) throw new Error(`Claude's ${name} did not match the expected shape.`);
    return r.parsed_output;
  }
  const json = z.toJSONSchema(schema);
  const strict = provider.kind === "openai";
  const messages = [{ role: "system", content: strict ? system : `${system}\n\nReply with ONLY a JSON object matching this JSON Schema, no prose, no code fences:\n${JSON.stringify(json)}` }, { role: "user", content: user }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await chatCompletion(provider, messages, { responseFormat: strict ? { type: "json_schema", json_schema: { name, strict: true, schema: json } } : undefined });
    let parsed;
    try { parsed = schema.safeParse(extractJson(text)); } catch (err) { parsed = { success: false, error: { message: err.message } }; }
    if (parsed.success) return parsed.data;
    const problems = parsed.error.issues ? parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : parsed.error.message;
    if (attempt === 1) throw new Error(`${provider.label} (${provider.model}) could not produce a valid ${name}: ${problems}`);
    log(`  ${provider.label} reply didn't validate (${problems}) - asking once more.`);
    messages.push({ role: "assistant", content: text }, { role: "user", content: `That did not validate: ${problems}. Reply again with ONLY the corrected JSON object.` });
  }
}

export async function planFromContext(ctx, { provider, log = () => {}, ...opts } = {}) {
  log(`Asking ${provider.label} (${provider.model}) to read the repo for ${targetOf(opts.target).label}…${opts.preferredTag ? ` (catalog says ${opts.preferredTag})` : ""}`);
  return provider.kind === "claude" ? planViaClaude(ctx, provider, log, opts) : planViaOpenAICompatible(ctx, provider, log, opts);
}

export async function listModels(provider) {
  if (provider.kind === "claude") {
    const client = new Anthropic({ apiKey: provider.apiKey, baseURL: provider.baseUrl.replace(/\/v1$/, "") });
    const ids = [];
    for await (const m of client.models.list()) ids.push(m.id);
    return ids.sort();
  }
  const res = await fetch(`${provider.baseUrl}/models`, {
    headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw await readError(res, provider.label);
  const data = await res.json();
  const ids = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);
  if (!ids.length) throw new Error(`${provider.label} listed no models.`);
  return ids.sort();
}
