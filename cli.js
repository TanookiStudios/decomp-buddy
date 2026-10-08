#!/usr/bin/env node
// Same pipeline as the app, no window.
//   node cli.js <github url>...            set up games
//   node cli.js --out DIR <url>...         choose output folder
//   node cli.js --clean [DIR]              only sweep Mac junk + refresh install.html
//   node cli.js --fake-plan plan.json ...  skip the AI, use a canned plan (testing)
//   node cli.js --list-models              print the active provider's model ids
// Provider via env: DECOMP_PROVIDER=claude|openai|gemini|groq|openrouter|deepseek|xai|mistral|ollama|custom
// (default claude), DECOMP_MODEL=<id>, DECOMP_BASE_URL=<url for custom>, DECOMP_TARGET=windows|macos-arm64|macos-x64|linux, and the provider's key env
// (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, ... DECOMP_API_KEY for custom).
// No key at all? Repos with a published plan still work (DECOMP_PLANS=<plans.json> to use a local file).

import fs from "node:fs";
import { runBatch, defaultOutDir } from "./src/run.js";
import { sweepMacJunk } from "./src/junk.js";
import { writeInstallHtml } from "./src/installhtml.js";
import { resolveProvider } from "./src/providers.js";
import { listModels } from "./src/plan.js";
import { fetchPublished } from "./src/plans.js";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return null; const [, v] = args.splice(i, 2); return v; };
const outDir = take("--out") || defaultOutDir();
const fakePlan = take("--fake-plan");
const clean = args.includes("--clean");
const wantModels = args.includes("--list-models");
const urls = args.filter((a) => !a.startsWith("--"));
const log = (m) => console.log(m);

const provider = () => resolveProvider(process.env.DECOMP_PROVIDER || "claude", { model: process.env.DECOMP_MODEL, baseUrl: process.env.DECOMP_BASE_URL });

try {
if (wantModels) {
  (await listModels(provider())).forEach((id) => log(id));
} else if (clean) {
  const removed = sweepMacJunk(outDir);
  removed.forEach((p) => log(`removed ${p}`));
  const { file, count } = writeInstallHtml(outDir);
  log(`Swept ${removed.length} file(s); install.html lists ${count} game(s): ${file}`);
} else if (!urls.length) {
  console.error("Usage: node cli.js [--out DIR] [--fake-plan plan.json] <github url>...   |   node cli.js --clean [--out DIR]");
  process.exit(2);
} else {
  const planner = fakePlan ? async () => JSON.parse(fs.readFileSync(fakePlan, "utf8")) : undefined;
  let prov = null;
  if (!fakePlan) { try { prov = provider(); } catch (err) { log(`No AI key set - published plans only (${err.message})`); } }
  const published = fakePlan ? null : await fetchPublished({ file: process.env.DECOMP_PLANS || null, cacheDir: path.join(os.homedir(), ".decomp-buddy") });
  const { results } = await runBatch(urls, { outDir, log, planner, provider: prov, target: process.env.DECOMP_TARGET || "windows", published });
  const failed = results.filter((r) => !r.ok);
  log(`\n${results.length - failed.length} set up, ${failed.length} failed.`);
  process.exit(failed.length ? 1 : 0);
}
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
