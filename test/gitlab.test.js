import test from "node:test";
import assert from "node:assert/strict";
import { fetchRepoContext } from "../src/gitlab.js";

// GitLab's API with one release whose download link has no file extension; `head` answers the name lookup.
function fakeGitLab(head) {
  return async (url, init = {}) => {
    const u = String(url);
    if (init.method === "HEAD") return head();
    if (/\/releases\?/.test(u)) return Response.json([{ tag_name: "v1.0.3", released_at: "2026-10-01", assets: { links: [{ name: "Game-v1.0.3-Windows", direct_asset_url: "https://gitlab.com/x/-/package_files/1/download" }] } }]);
    if (/\/repository\/tree/.test(u)) return Response.json([]);
    if (/\/repository\/files\//.test(u)) return new Response("", { status: 404 });
    return Response.json({ default_branch: "main", web_url: "https://gitlab.com/dev/game" });
  };
}

test("a download link's real name comes from GitLab's answer", async (t) => {
  t.mock.method(globalThis, "fetch", fakeGitLab(() => new Response(null, { headers: { "content-disposition": 'attachment; filename="Game-v1.0.3-Windows.zip"' } })));
  const ctx = await fetchRepoContext({ owner: "dev", repo: "game" });
  assert.equal(ctx.releases[0].assets[0].name, "Game-v1.0.3-Windows.zip");
});

test("when GitLab refuses the name lookup, the whole lookup fails instead of guessing a name that matches no file", async (t) => {
  t.mock.method(globalThis, "fetch", fakeGitLab(() => new Response("Rate limit exceeded", { status: 429 })));
  await assert.rejects(fetchRepoContext({ owner: "dev", repo: "game" }), /GitLab 429/);
});
