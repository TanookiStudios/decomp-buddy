#!/usr/bin/env node
// Same pipeline as the app, no window.
//   node cli.js <github url>...            set up games
//   node cli.js --out DIR <url>...         choose output folder
//   node cli.js --clean [DIR]              only sweep Mac junk + refresh install.html
//   node cli.js --fake-plan plan.json ...  skip the AI, use a canned plan (testing)
//   node cli.js --list-models              print the active provider's model ids
//   node cli.js --run "name"               start an installed game (native builds; Wine/Proton games start from the app)
//   node cli.js --update [name|all]        update installed games (published plans; your AI key only if set)
//   node cli.js --uninstall "name"         move an installed game's folder to the Trash
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
import { spawn } from "node:child_process";
import { readManifests } from "./src/installhtml.js";
import { findExecutable, launchSpec, splitArgs } from "./src/gametools.js";
import { targetIsHost } from "./src/targets.js";
import { moveToTrash } from "./src/trash.js";

const args = process.argv.slice(2);
const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return null; const [, v] = args.splice(i, 2); return v; };
const outDir = take("--out") || defaultOutDir();
const fakePlan = take("--fake-plan");
const clean = args.includes("--clean");
const wantModels = args.includes("--list-models");
const runName = take("--run"), uninstallName = take("--uninstall");
const updateIdx = args.indexOf("--update"), updateName = updateIdx < 0 ? null : (args[updateIdx + 1] && !args[updateIdx + 1].startsWith("--") ? args.splice(updateIdx, 2)[1] : (args.splice(updateIdx, 1), "all"));
const urls = args.filter((a) => !a.startsWith("--"));
const log = (m) => console.log(m);

const provider = () => resolveProvider(process.env.DECOMP_PROVIDER || "claude", { model: process.env.DECOMP_MODEL, baseUrl: process.env.DECOMP_BASE_URL });

// Installed games in the output folder whose name matches (your name for it, the game's, or the folder's).
function installed(name) {
  const all = readManifests(outDir).map((m) => ({ m, folder: path.join(outDir, m.folder), title: m.displayName || m.plan?.game_title || m.folder }));
  if (!name || name === "all") return all;
  const n = name.toLowerCase(), exact = all.filter((g) => [g.title, g.m.plan?.game_title, g.m.folder].some((t) => String(t || "").toLowerCase() === n));
  return exact.length ? exact : all.filter((g) => g.title.toLowerCase().includes(n) || g.m.folder.toLowerCase().includes(n));
}
const one = (name) => {
  const hits = installed(name);
  if (!hits.length) throw new Error(`No installed game matches "${name}" in ${outDir}.`);
  if (hits.length > 1) throw new Error(`"${name}" matches ${hits.length} games: ${hits.map((g) => g.title).join(", ")}. Be more specific.`);
  return hits[0];
};

try {
if (runName) {
  const g = one(runName);
  if (!targetIsHost(g.m.target || "windows")) throw new Error(`${g.title} is the ${g.m.target} build - start it from the app (it can use Wine or Proton) or on that computer.`);
  const exe = findExecutable(g.folder, g.m.plan?.build?.executable);
  if (!exe) throw new Error(`Couldn't find ${g.title}'s program in ${g.folder}.`);
  const { cmd, argv, opts } = launchSpec(exe, { args: splitArgs(g.m.launchArgs) });
  if (process.env.DECOMP_NO_LAUNCH) log(`(test run: would start ${cmd} ${argv.join(" ")})`);
  else spawn(cmd, argv, { ...opts, detached: true, stdio: "ignore" }).unref();
  log(`Started ${g.title}.`);
} else if (uninstallName) {
  const g = one(uninstallName), r = moveToTrash(g.folder);
  writeInstallHtml(outDir); log(`Moved ${g.title} to ${r.to}.`);
} else if (updateName) {
  const games = installed(updateName).filter((g) => g.m.repoUrl);
  if (!games.length) throw new Error(updateName === "all" ? `No installed games with a project link in ${outDir}.` : `No installed game matches "${updateName}".`);
  let prov = null; try { prov = provider(); } catch { log("No AI key set - published plans only."); }
  const published = await fetchPublished({ file: process.env.DECOMP_PLANS || null, cacheDir: path.join(os.homedir(), ".decomp-buddy") });
  let failed = 0;
  for (const target of new Set(games.map((g) => g.m.target || "windows"))) {
    const { results } = await runBatch(games.filter((g) => (g.m.target || "windows") === target).map((g) => g.m.repoUrl), { outDir, log, provider: prov, target, published });
    failed += results.filter((r) => !r.ok).length;
  }
  log(`\nChecked ${games.length} game(s); ${failed} failed.`); process.exit(failed ? 1 : 0);
} else if (wantModels) {
  (await listModels(provider())).forEach((id) => log(id));
} else if (clean) {
  const removed = sweepMacJunk(outDir);
  removed.forEach((p) => log(`removed ${p}`));
  const { file, count } = writeInstallHtml(outDir);
  log(`Swept ${removed.length} file(s); install.html lists ${count} game(s): ${file}`);
} else if (!urls.length) {
  console.error("Usage: node cli.js [--out DIR] [--fake-plan plan.json] <github url>...   |   --clean   |   --run NAME   |   --update [NAME|all]   |   --uninstall NAME");
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
