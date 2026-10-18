import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { fetchPackages, withDependencies, searchPackages, newerVersion, depRef, COMMUNITIES } from "../src/thunderstore.js";
import { hideAdult } from "../src/gamebanana.js";
import { unpackIntoMods, modsDir } from "../src/mods.js";

// Trimmed real answer from https://thunderstore.io/c/starfox-64-recompiled/api/v1/package/ (2026-10-18).
const fx = JSON.parse(fs.readFileSync(new URL("./fixtures/thunderstore-starfox.json", import.meta.url), "utf8"));
const load = (list = fx) => fetchPackages("starfox-64-recompiled", { fetchImpl: async (url) => { assert.equal(url, "https://thunderstore.io/c/starfox-64-recompiled/api/v1/package/"); return { ok: true, json: async () => list }; } });

test("Thunderstore packages: newest version, downloads summed, size and dependencies kept", async () => {
  const all = await load();
  const voices = all.find((p) => p.fullName === "BlueSky-Uncompressed_Voices");
  assert.equal(voices.namespace, "BlueSky"); assert.equal(voices.title, "Uncompressed Voices");
  assert.equal(voices.downloadUrl, `https://thunderstore.io/package/download/BlueSky/Uncompressed_Voices/${voices.version}/`);
  assert.deepEqual(voices.dependencies, ["SonicDcer-Audio_API-0.5.1"]);
  const tool = all.find((p) => p.fullName === "Vertigo-Stop_N_Swop_Tranfer_Tool");
  assert.equal(tool.version, "1.1.0"); assert.equal(tool.downloads, fx.find((p) => p.full_name === tool.fullName).versions.reduce((n, v) => n + v.downloads, 0));
  assert.ok(tool.size > 0);
});

test("dependencies come first, each once; ones from another game are reported, not installed", async () => {
  const all = await load();
  const voices = withDependencies(all.find((p) => p.name === "Uncompressed_Voices"), all);
  assert.deepEqual(voices.order.map((p) => p.fullName), ["SonicDcer-Audio_API", "BlueSky-Uncompressed_Voices"]); assert.deepEqual(voices.missing, []);
  const wrong = withDependencies(all.find((p) => p.name === "Stop_N_Swop_Transfer_Tool"), all);
  assert.deepEqual(wrong.order.map((p) => p.name), ["Stop_N_Swop_Transfer_Tool"]);
  assert.deepEqual(wrong.missing, ["LT_Schmiddy-RecompExternalPython_for_BanjoRecompiled"]);
  // A loop between two packages ends.
  const a = { fullName: "x-A", dependencies: ["x-B-1.0.0"] }, b = { fullName: "x-B", dependencies: ["x-A-1.0.0"] };
  assert.deepEqual(withDependencies(a, [a, b]).order.map((p) => p.fullName), ["x-B", "x-A"]);
  assert.deepEqual(depRef("LT_Schmiddy-RecompExternalPython_for_Starfox64Recompiled-2.0.0"), { namespace: "LT_Schmiddy", name: "RecompExternalPython_for_Starfox64Recompiled", version: "2.0.0", fullName: "LT_Schmiddy-RecompExternalPython_for_Starfox64Recompiled" });
});

test("search, adult packages hidden unless asked, version order", async () => {
  const nsfw = { ...fx[0], full_name: "Someone-Lewd_Pack", name: "Lewd_Pack", owner: "Someone", has_nsfw_content: true };
  const all = await load([...fx, nsfw]);
  assert.deepEqual(searchPackages(all, "audio api").map((p) => p.fullName), ["SonicDcer-Audio_API"]);
  assert.equal(hideAdult(searchPackages(all), false).some((p) => p.adult), false);
  assert.equal(hideAdult(searchPackages(all), true).filter((p) => p.adult).length, 1);
  assert.equal(newerVersion("1.10.0", "1.9.9"), true); assert.equal(newerVersion("1.1.2", "1.1.2"), false); assert.equal(newerVersion("0.9.0", "1.0.0"), false);
  assert.equal(COMMUNITIES["zelda64recomp/zelda64recomp"], "zelda-64-recompiled");
});

test("a Thunderstore zip of mod files unpacks to the files, without its manifest and icon", () => {
  const game = fs.mkdtempSync(path.join(os.tmpdir(), "db-ts-")); const dl = path.join(modsDir(game), "downloads"); fs.mkdirSync(dl, { recursive: true });
  const z = new AdmZip(); for (const [n, c] of Object.entries({ "manifest.json": "{}", "icon.png": "png", "README.md": "# hi", "hd.o2r": "mod" })) z.addFile(n, Buffer.from(c));
  z.writeZip(path.join(dl, "Net64-Beta_Boost_Gauge.zip"));
  unpackIntoMods(game, path.join(dl, "Net64-Beta_Boost_Gauge.zip"));
  assert.deepEqual(fs.readdirSync(modsDir(game)).sort(), ["downloads", "hd.o2r"]);
});
