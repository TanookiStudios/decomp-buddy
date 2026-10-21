import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRedditRss, reposIn } from "../src/discover.js";

test("reddit rss: repos pulled from post bodies and links", () => {
  const xml = `<feed><entry><title>Mega Man X2 Recomp is Out NOW!</title><link href="https://www.reddit.com/r/decomps/comments/x/"/><updated>2026-09-15T00:00:00+00:00</updated><content type="html">&lt;p&gt;get it at &lt;a href="https://github.com/mstan/MegaManX2Recomp/releases"&gt;here&lt;/a&gt; and https://github.com/sponsors/nope&lt;/p&gt;</content></entry>
  <entry><title>plain</title><link href="https://github.com/new-coke/strikers"/><updated>2026-09-14T00:00:00+00:00</updated></entry></feed>`;
  const r = parseRedditRss(xml, "decomps");
  assert.deepEqual(r.map((x) => x.repo), ["mstan/MegaManX2Recomp", "new-coke/strikers"]);
  assert.equal(r[0].via, "r/decomps");
  assert.equal(reposIn("see github.com/A/B.git, github.com/A/B/issues and github.com/topics/x").size, 1);
});

test("youtube: channel id resolution accepts ids and handles; feed parse pulls repos from descriptions", async () => {
  const { youtubeChannelId, scanYouTube } = await import("../src/discover.js");
  assert.equal(await youtubeChannelId("UCXuqSBlHAE6Xw-yeJA0Tunw"), "UCXuqSBlHAE6Xw-yeJA0Tunw");
  const r = await scanYouTube(["nope"], { resolve: async () => { throw new Error("no such channel"); } });
  assert.deepEqual(r.candidates, []); assert.match(r.errors[0], /no such channel/);
});

test("reddit: posts without a GitHub link keep their title as a lead; a 429 gets one retry", async () => {
  const { parseRedditRss, scanReddit } = await import("../src/discover.js");
  const xml = `<feed><entry><title>Burnout 3 Takedown Is Finally On PC</title><link href="https://www.reddit.com/r/recomps/comments/y/"/><updated>2026-10-16T00:00:00+00:00</updated><content type="html">&lt;p&gt;video&lt;/p&gt;</content></entry>
  <entry><title>What should I play tonight?</title><link href="https://www.reddit.com/r/recomps/comments/z/"/></entry></feed>`;
  const r = parseRedditRss(xml, "recomps");
  assert.equal(r.length, 0);
  assert.deepEqual(r.unlinked.map((u) => u.title), ["Burnout 3 Takedown Is Finally On PC"]);
  const real = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => (++calls === 1 ? { status: 429, ok: false } : { status: 200, ok: true, text: async () => xml });
  try {
    const s = await scanReddit(["recomps"], { gap: 0, retryAfter: 0 });
    assert.equal(calls, 2); assert.deepEqual(s.errors, []); assert.equal(s.unlinked.length, 1);
  } finally { globalThis.fetch = real; }
});

test("recomphaven.com: repo links from its data file, GitHub and GitLab", async () => {
  const { parseRecompHaven } = await import("../src/discover.js");
  const js = `window.RECOMPS = [
  {"id": "ac6", "title": "Ace Combat 6: Fires of Liberation", "project": "AC6_recomp", "repo": "https://github.com/sal063/AC6_recomp", "website": null},
  {"id": "mk64", "title": "Mario Kart 64", "repo": "https://gitlab.com/sonicdcer/mariokart64recomp", "website": null},
  {"id": "x", "title": "No Repo Yet", "repo": null}
];`;
  assert.deepEqual(parseRecompHaven(js).map((r) => [r.repo, r.title]), [["sal063/AC6_recomp", "Ace Combat 6: Fires of Liberation"], ["gitlab:sonicdcer/mariokart64recomp", "Mario Kart 64"]]);
});

test("unbaked.games: only projects whose own downloads run on a system we install for", async () => {
  const { unbakedProjects } = await import("../src/discover.js");
  const game = { title: "Super Metroid", url: "https://unbaked.games/games/super-metroid/", projects: [
    { url: "https://github.com/snesrev/sm", runs_on: [] },                                   // decomp with no builds
    { url: "https://github.com/a/sm-pc", runs_on: ["Windows", "Linux"] },
    { url: "https://github.com/b/sm-switch", runs_on: ["Switch"] },                           // a system we don't do
    { url: "https://github.com/c/toolkit", runs_on: ["Windows"], general_tool: true },        // a tool, not the game
    { url: "https://gitlab.com/d/sm-recomp", runs_on: ["macOS"] },
  ] };
  assert.deepEqual(unbakedProjects(game).map((p) => p.repo), ["a/sm-pc", "gitlab:d/sm-recomp"]);
});

test("unbaked.games: open-source PC originals are left out, ports of PC games stay", async () => {
  const { openSourceOriginal } = await import("../src/discover.js");
  assert.equal(openSourceOriginal({ platform: "PC", methods: ["Source release"] }), true);          // Battle for Wesnoth
  assert.equal(openSourceOriginal({ platform: "PC", methods: ["Reimplementation"] }), false);       // OpenRCT2
  assert.equal(openSourceOriginal({ platform: "DOS", methods: ["Source release"] }), false);        // Doom
  assert.equal(openSourceOriginal({ platform: "PS1", methods: ["Static recomp"] }), false);
});

test("awesome lists: games from the decomp list's data and the PC-ports README; tools, browser ports and the lists themselves left out", async () => {
  const { scanAwesomeLists } = await import("../src/discover.js");
  const fetch = async (u) => ({ ok: true, json: async () => ({ games: [{ repo: "a/port", type: "source-port", title: "A" }, { repo: "b/tool", type: "tool" }, { repo: "c/web", type: "browser-port" }] }),
    text: async () => "see https://github.com/d/recomp and https://github.com/Sebastrion/awesome-unofficial-pc-ports and https://github.com/TanookiStudios/decomp-buddy" });
  assert.deepEqual((await scanAwesomeLists({ fetch })).map((c) => c.repo), ["a/port", "d/recomp"]);
});
