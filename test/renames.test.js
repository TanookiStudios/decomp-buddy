import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSources } from "../src/catalog.js";
import { planKey } from "../src/plans.js";
import { canonRepo } from "../src/renames.js";

test("a moved GitHub owner collapses onto one entry, one plan key, one installed key", () => {
  const old = { id: "github:alexbeav/ape-escape-recomp", owner: "Alexbeav", repo: "ape-escape-recomp", repoUrl: "https://github.com/Alexbeav/ape-escape-recomp", title: "Ape Escape", source: "portsdr" };
  const now = { id: "github:alexbeavs-ps1-ports/ape-escape-recomp", owner: "alexbeavs-ps1-ports", repo: "ape-escape-recomp", repoUrl: "https://github.com/alexbeavs-ps1-ports/ape-escape-recomp", title: "Ape Escape", source: "alexbeav" };
  const m = mergeSources([[old], [now]]);
  assert.equal(m.length, 1); assert.deepEqual(m[0].sources, ["portsdr", "alexbeav"]); assert.equal(m[0].repoUrl, "https://github.com/alexbeavs-ps1-ports/ape-escape-recomp");
  assert.equal(planKey("github", "Alexbeav", "ape-escape-recomp"), planKey("github", "alexbeavs-ps1-ports", "ape-escape-recomp"));
  assert.equal(canonRepo("Alexbeav/ape-escape-recomp"), "alexbeavs-ps1-ports/ape-escape-recomp");
  assert.equal(canonRepo("HarbourMasters/Shipwright"), "HarbourMasters/Shipwright");
});

test("each console gets one name, so Browse shows it once", () => {
  const g = (id, console) => ({ source: "s", id, title: id, console, platforms: [] });
  const merged = mergeSources([[g("a", "Nintendo Game Boy Advance"), g("b", "Sony PlayStation"), g("c", "PC (DOS)"), g("d", "Sega Genesis")], [g("e", "Game Boy Advance"), g("f", "PC (Windows)"), g("h", "Sega Model 2")]]);
  assert.deepEqual(merged.map((x) => x.console), ["Game Boy Advance", "PlayStation", "IBM PC (MS-DOS)", "Mega Drive", "Game Boy Advance", "PC (Windows)", "Sega Model 2"]);
});

test("a repo that stayed behind keeps its owner when the rest moved", () => {
  assert.equal(canonRepo("alexbeav/fm4-recomp"), "alexbeav/fm4-recomp");
  assert.equal(canonRepo("alexbeav/medievil-recomp"), "alexbeavs-ps1-ports/medievil-recomp");
  assert.equal(planKey("github", "Alexbeav", "fm4-recomp"), "github:alexbeav/fm4-recomp");
  const [g] = mergeSources([[{ source: "s", id: "github:alexbeav/fm4-recomp", title: "Forza Motorsport 4", console: "Xbox 360", owner: "Alexbeav", repo: "fm4-recomp", repoUrl: "https://github.com/Alexbeav/fm4-recomp", platforms: [] }]]);
  assert.equal(g.repoUrl, "https://github.com/Alexbeav/fm4-recomp");
});
