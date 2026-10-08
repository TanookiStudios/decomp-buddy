import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promoteReady, readWaiting, waitingKeys, waitingFileNextTo, withoutExcluded } from "../src/waiting.js";

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waiting-"));
  const findsFile = path.join(dir, "finds.json");
  fs.writeFileSync(findsFile, JSON.stringify({ games: [{ repo: "a/kept", title: "Kept", console: "PC (Windows)", platforms: ["Windows"] }] }));
  fs.writeFileSync(waitingFileNextTo(findsFile), JSON.stringify({ games: [
    { repo: "pret/pokered", title: "Pokemon Red", console: "Game Boy", notes: "Disassembly" },
    { repo: "x/ported", title: "Now Ported", console: "Nintendo 64", notes: "" },
    { repo: "y/android", title: "Phone Only", console: "Others", notes: "" },
  ], hidden: [{ repo: "z/awesome-list", title: "awesome list", reason: "Not a game" }] }));
  return { dir, findsFile };
}
const fakeGitHub = async (key) => ({
  "pret/pokered": { exists: true, repo: "pret/pokered", platforms: [] },
  "x/ported": { exists: true, repo: "X/Ported", platforms: ["Windows", "Linux"], version: "v1.0", status: "latest", updatedAt: "2026-10-01T00:00:00Z", notes: "A PC port", website: "" },
  "y/android": { exists: true, repo: "y/android", platforms: ["Android"] },
})[key];

test("waiting: a project with a desktop download moves to finds; ROM-only and phone-only stay", async () => {
  const { findsFile } = fixture();
  const prev = process.env.GITHUB_TOKEN; process.env.GITHUB_TOKEN = "test";
  try {
    const moved = await promoteReady({ findsFile, log: () => {}, check: fakeGitHub });
    assert.deepEqual(moved, ["X/Ported"]);
    const finds = JSON.parse(fs.readFileSync(findsFile, "utf8")).games;
    assert.deepEqual(finds.map((g) => g.repo).sort(), ["X/Ported", "a/kept"]);
    assert.deepEqual(finds.find((g) => g.repo === "X/Ported").platforms, ["Windows", "Linux"]);
    assert.deepEqual([...waitingKeys(waitingFileNextTo(findsFile))].sort(), ["pret/pokered", "y/android", "z/awesome-list"]);
    assert.equal(readWaiting(waitingFileNextTo(findsFile)).hidden.length, 1, "promoting must not drop the hidden list");
  } finally { process.env.GITHUB_TOKEN = prev ?? ""; }
});

test("waiting: without a token nothing is checked and nothing moves", async () => {
  const { findsFile } = fixture();
  const prev = process.env.GITHUB_TOKEN; process.env.GITHUB_TOKEN = "";
  let asked = 0; const lines = [];
  try {
    const moved = await promoteReady({ findsFile, log: (m) => lines.push(m), check: async (k) => { asked++; return fakeGitHub(k); } });
    assert.deepEqual(moved, []); assert.equal(asked, 0);
    assert.match(lines.join("\n"), /no GITHUB_TOKEN/);
    assert.equal(readWaiting(waitingFileNextTo(findsFile)).games.length, 3);
  } finally { process.env.GITHUB_TOKEN = prev ?? ""; }
});

test("waiting: a rate limit keeps every unchecked project on the list", async () => {
  const { findsFile } = fixture();
  const prev = process.env.GITHUB_TOKEN; process.env.GITHUB_TOKEN = "test";
  try {
    await promoteReady({ findsFile, log: () => {}, check: async (k) => { if (k !== "x/ported") throw new Error("GitHub rate limit hit."); return fakeGitHub(k); } });
    const left = [...waitingKeys(waitingFileNextTo(findsFile))].sort();
    assert.ok(left.includes("pret/pokered") && left.includes("y/android"), `lost a project: ${left}`);
  } finally { process.env.GITHUB_TOKEN = prev ?? ""; }
});

test("waiting: no finds file means no waiting file, not one in the working folder", () => {
  assert.equal(waitingFileNextTo(""), "");
  assert.equal(readWaiting("").games.length, 0);
});

test("waiting: the catalog drops waiting and hidden repos whichever source lists them, and keeps the rest", () => {
  const doc = { games: [{ repo: "pret/pokered" }], hidden: [{ repo: "Z/Awesome-List" }] };
  const games = [{ owner: "pret", repo: "pokered", source: "portsdr" }, { owner: "z", repo: "awesome-list", source: "finds" }, { owner: "Harbourmasters", repo: "Shipwright" }, { title: "no repo" }];
  assert.deepEqual(withoutExcluded(games, doc).map((g) => g.repo || g.title), ["Shipwright", "no repo"]);
  assert.equal(withoutExcluded(games, null).length, 4, "no list loaded = nothing held back");
});

test("waiting: a hidden entry can name a catalog id, for cards with no repository", () => {
  const doc = { games: [], hidden: [{ id: "project:nelumbo", title: "Lotus Trilogy", reason: "Not on GitHub" }] };
  const games = [{ id: "project:nelumbo", title: "Lotus Trilogy" }, { id: "github:a/b", owner: "a", repo: "b" }, { id: "project:other", title: "Other" }];
  assert.deepEqual(withoutExcluded(games, doc).map((g) => g.id), ["github:a/b", "project:other"]);
});

test("waiting: a rate limit counts every project it left unchecked", async () => {
  const { findsFile } = fixture();
  const prev = process.env.GITHUB_TOKEN; process.env.GITHUB_TOKEN = "test"; const lines = [];
  try {
    await promoteReady({ findsFile, log: (m) => lines.push(m), check: async () => { throw new Error("GitHub rate limit hit."); } });
    assert.match(lines.join("\n"), /\(3 couldn't be checked\)/);
  } finally { process.env.GITHUB_TOKEN = prev ?? ""; }
});
