import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planKey, lookupPlan, writePlans } from "../src/plans.js";
import { analyzeOne } from "../src/run.js";

const analysis = { redirect_repo: null, games: [{ game_title: "Skate 3", console: "Xbox 360", build: { method: "release", release_asset: "Skate3Recomp-Windows.zip", release_tag: "v2.0.2", build_steps: [], required_tools: [], executable: "skate3.exe" }, game_files: [], first_run: [], notes: [], confidence: "high", unsure: [], artwork_url: null, mods: { supported: false, method: "unknown", folder: null, formats: [], notes: "", links: [] } }] };

test("plans: write, merge per target, look up with Intel-Mac fallback", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "plans-")), "plans.json");
  writePlans(f, { [planKey("github", "mchughalex", "skate3recomp")]: { tag: "v2.0.2", generatedAt: "2026-09-19", targets: { windows: analysis } } });
  writePlans(f, { "github:mchughalex/skate3recomp": { tag: "v2.0.2", targets: { "macos-arm64": analysis } } });
  const pub = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.deepEqual(Object.keys(pub.plans["github:mchughalex/skate3recomp"].targets).sort(), ["macos-arm64", "windows"]);
  assert.equal(lookupPlan(pub, "github:mchughalex/skate3recomp", "macos-x64").analysis.games[0].game_title, "Skate 3");
  assert.equal(lookupPlan(pub, "github:mchughalex/skate3recomp", "linux"), null);
  assert.equal(lookupPlan(pub, "github:nobody/nothing", "windows"), null);
});

test("analyzeOne: a published plan means no AI and no key; without either it says so plainly", async () => {
  const published = { plans: { "github:mchughalex/skate3recomp": { tag: "v2.0.2", generatedAt: "2026-09-19", targets: { windows: analysis } } } };
  // Canned repo context so the test never touches GitHub (rate limits made the live version flaky).
  const fetchContext = async () => ({ owner: "mchughalex", repo: "skate3recomp", releases: [{ tag_name: "v2.0.2", assets: [{ name: "Skate3Recomp-Windows.zip" }] }] });
  const items = await analyzeOne("https://github.com/mchughalex/skate3recomp", { log: () => {}, published, fetchContext, planner: async () => { throw new Error("AI must not be called"); } });
  assert.equal(items[0].planSource, "published"); assert.equal(items[0].plan.game_title, "Skate 3");
  // Plan names an asset the repo no longer has and there's no AI to re-plan: use it anyway, but say it's older.
  const stale = await analyzeOne("https://github.com/mchughalex/skate3recomp", { log: () => {}, published, fetchContext: async () => ({ releases: [{ tag_name: "v3", assets: [{ name: "Skate3Recomp-Windows-v3.zip" }] }] }) });
  assert.equal(stale[0].planSource, "published-stale");
  await assert.rejects(analyzeOne("https://github.com/mchughalex/skate3recomp", { log: () => {}, published: { plans: {} }, fetchContext }), /No published plan/);
});

test("analyzeOne: onlyGames keeps exactly the picked games; punctuation doesn't matter; no match is an error, not all games", async () => {
  const two = { redirect_repo: null, games: [{ ...analysis.games[0], game_title: "Spider-Man" }, { ...analysis.games[0], game_title: "Spider-Man 2: Enter Electro" }] };
  const published = { plans: { "github:gtteancum/openspideyps1": { tag: "v1", generatedAt: "2026-09-19", targets: { windows: two } } } };
  const fetchContext = async () => ({ releases: [{ tag_name: "v1", assets: [{ name: "Skate3Recomp-Windows.zip" }] }] });
  const one = await analyzeOne("https://github.com/GTTeancum/OpenSpideyPS1", { log: () => {}, published, fetchContext, onlyGames: ["spider man 2 - Enter Electro"] });
  assert.deepEqual(one.map((i) => i.plan.game_title), ["Spider-Man 2: Enter Electro"]);
  await assert.rejects(analyzeOne("https://github.com/GTTeancum/OpenSpideyPS1", { log: () => {}, published, fetchContext, onlyGames: ["Not A Game Here"] }), /no longer lists Not A Game Here/);
});

test("fetchPublished creates its cache folder (the CLI's ~/.decomp-buddy may not exist yet)", async () => {
  const { fetchPublished } = await import("../src/plans.js");
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pc-")), "not", "yet");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ plans: { "github:a/b": { targets: {} } } }), { status: 200 });
  try { await fetchPublished({ cacheDir: dir }); } finally { globalThis.fetch = realFetch; }
  assert.ok(fs.existsSync(path.join(dir, "plans-cache.json")));
});
