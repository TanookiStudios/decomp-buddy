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
