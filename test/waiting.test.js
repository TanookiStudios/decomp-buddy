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

test("waiting: checked at most every few hours, and a rate-limited check doesn't count as checked", async () => {
  const { dir, findsFile } = fixture();
  const stampFile = path.join(dir, "stamp");
  const prev = process.env.GITHUB_TOKEN; process.env.GITHUB_TOKEN = "test";
  let asked = 0;
  const checkMany = async (keys) => { asked += keys.length; return new Map(keys.map((k) => [k, { exists: true, repo: k, platforms: [] }])); };
  try {
    await promoteReady({ findsFile, log: () => {}, checkMany, stampFile });
    assert.equal(asked, 3);
    await promoteReady({ findsFile, log: () => {}, checkMany, stampFile });
    assert.equal(asked, 3, "a second build within the window asks nobody");
    await promoteReady({ findsFile, log: () => {}, checkMany, stampFile, force: true });
    assert.equal(asked, 6);
    fs.rmSync(stampFile);
    await promoteReady({ findsFile, log: () => {}, checkMany: async (keys) => new Map(keys.map((k) => [k, new Error("GitHub rate limit hit.")])), stampFile });
    assert.ok(!fs.existsSync(stampFile), "a failed check must not start the 6-hour wait");
  } finally { process.env.GITHUB_TOKEN = prev ?? ""; }
});

test("enrichMany reads a GraphQL batch: renames followed, missing repos marked, platforms from release files", async () => {
  const { enrichMany } = await import("../src/sources/finds.js");
  const prev = process.env.GITHUB_TOKEN; process.env.GITHUB_TOKEN = "test";
  let queries = 0;
  const post = async (q) => { queries++; assert.match(q, /r0: repository\(owner: "Old", name: "name"\)/);
    return { r0: { nameWithOwner: "New/name", description: "N64 port", homepageUrl: "", pushedAt: "2026-01-01T00:00:00Z", stargazerCount: 5, isFork: false, repositoryTopics: { nodes: [] },
      releases: { nodes: [{ tagName: "v2", isPrerelease: false, isDraft: false, publishedAt: "2026-02-01T00:00:00Z", releaseAssets: { nodes: [{ name: "game-windows-x64.zip" }, { name: "game.AppImage" }] } }] } }, r1: null }; };
  try {
    const m = await enrichMany(["Old/name", "gone/repo"], { post });
    assert.equal(queries, 1);
    const a = m.get("Old/name");
    assert.equal(a.repo, "New/name"); assert.deepEqual(a.platforms.sort(), ["Linux", "Windows"]); assert.equal(a.version, "v2"); assert.equal(a.consoleGuess, "Nintendo 64");
    assert.equal(m.get("gone/repo").exists, false);
    const failed = await enrichMany(["a/b"], { post: async () => { throw new Error("GitHub rate limit hit."); } });
    assert.ok(failed.get("a/b") instanceof Error);
  } finally { process.env.GITHUB_TOKEN = prev ?? ""; }
});

test("enrichMany: a release labeled NOT A RELEASE / test-only is not a download", async () => {
  const { enrichMany } = await import("../src/sources/finds.js");
  const prev = process.env.GITHUB_TOKEN; process.env.GITHUB_TOKEN = "test";
  const post = async () => ({ r0: { nameWithOwner: "a/b", description: "", homepageUrl: "", pushedAt: "2026-01-01T00:00:00Z", stargazerCount: 0, isFork: false, repositoryTopics: { nodes: [] },
    releases: { nodes: [{ name: "NOT A RELEASE: test file for issue #12 only", tagName: "issue-12-test-build", isPrerelease: true, isDraft: false, publishedAt: "2026-02-01T00:00:00Z", releaseAssets: { nodes: [{ name: "NOT-A-RELEASE-issue12-test-only-windows.zip" }] } }] } } });
  try { const i = (await enrichMany(["a/b"], { post })).get("a/b"); assert.deepEqual(i.platforms, []); assert.equal(i.version, null); }
  finally { process.env.GITHUB_TOKEN = prev ?? ""; }
});
