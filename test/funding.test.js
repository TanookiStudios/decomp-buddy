import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFunding, fundingLinks, fetchFunding } from "../src/funding.js";

test("FUNDING.yml: every shape GitHub accepts becomes https links; junk doesn't", () => {
  const yml = `# comment
github: [octocat, "surftocat"]
patreon: someone # trailing comment
open_collective:
ko_fi: zerkiller
custom:
  - paypal.me/someone
  - "https://example.com/donate"
liberapay: ~
polar: javascript:alert(1)
`;
  const links = fundingLinks(parseFunding(yml));
  assert.deepEqual(links.map((l) => l.url), [
    "https://github.com/sponsors/octocat", "https://github.com/sponsors/surftocat", "https://www.patreon.com/someone",
    "https://ko-fi.com/zerkiller", "https://paypal.me/someone", "https://example.com/donate",
  ]);
  assert.equal(links[0].label, "GitHub Sponsors");
});

test("fetchFunding looks in the repo first, then the owner's .github repo", async () => {
  const hits = [];
  const fetchImpl = async (url) => { hits.push(url); return url.includes("/me/.github/HEAD/.github/FUNDING.yml") ? new Response("ko_fi: me") : new Response("", { status: 404 }); };
  const r = await fetchFunding("me", "port", { fetchImpl });
  assert.equal(r.from, "me/.github"); assert.equal(r.links[0].url, "https://ko-fi.com/me");
  assert.ok(hits[0].includes("/me/port/HEAD/.github/FUNDING.yml"));
});
