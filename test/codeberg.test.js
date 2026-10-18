import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseRepoUrl } from "../src/github.js";
import { hostOf, repoUrlOf } from "../src/hosts.js";
import { fetchRepoContext } from "../src/forgejo.js";
import { parseDeepLink } from "../src/deeplink.js";
import { fromText } from "../src/sources/list-url.js";
import { parseRepo } from "../src/sources/portsdr.js";
import { queueKey } from "../scripts/triage.mjs";

const fx = JSON.parse(fs.readFileSync(new URL("./fixtures/codeberg-repo.json", import.meta.url), "utf8"));

test("Codeberg links are recognized everywhere a repo link is read; unknown hosts still fail", () => {
  assert.deepEqual(parseRepoUrl("https://codeberg.org/BoundlessWizard/asura-wrath-recomp"), { host: "codeberg", owner: "BoundlessWizard", repo: "asura-wrath-recomp" });
  assert.deepEqual(parseRepoUrl("https://codeberg.org/a/b.git"), { host: "codeberg", owner: "a", repo: "b" });
  assert.equal(repoUrlOf("codeberg", "a", "b"), "https://codeberg.org/a/b");
  assert.throws(() => hostOf("bitbucket"), /doesn't know the repository host/);
  assert.equal(parseDeepLink("decompbuddy://add?repo=a/b&host=codeberg").repoUrl, "https://codeberg.org/a/b");
  assert.equal(parseDeepLink("decompbuddy://add?repo=a/b&host=constructor").host, "github");
  const [card] = fromText("see https://codeberg.org/BoundlessWizard/asura-wrath-recomp for builds", "t");
  assert.equal(card.id, "codeberg:boundlesswizard/asura-wrath-recomp"); assert.equal(card.repoUrl, "https://codeberg.org/BoundlessWizard/asura-wrath-recomp");
  assert.equal(card.releaseUrl, "https://codeberg.org/BoundlessWizard/asura-wrath-recomp/releases");
  assert.equal(parseRepo("https://codeberg.org/a/b").host, "codeberg");
});

test("triage: Codeberg repos travel as codeberg:owner/repo", () => {
  assert.equal(queueKey("https://codeberg.org/BoundlessWizard/asura-wrath-recomp"), "codeberg:BoundlessWizard/asura-wrath-recomp");
  assert.equal(queueKey("https://gitlab.com/sonicdcer/starfox64recomp.git"), "gitlab:sonicdcer/starfox64recomp");
  assert.equal(queueKey("https://github.com/a/b"), "a/b");
});

test("forgejo context has the same shape as GitHub's and GitLab's (from saved API answers, no network)", async (t) => {
  const seen = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    seen.push(String(url));
    const json = (v) => ({ ok: true, status: 200, json: async () => v, text: async () => JSON.stringify(v) });
    if (url.endsWith("/repos/BoundlessWizard/asura-wrath-recomp")) return json(fx.repo);
    if (url.includes("/releases?")) return json(fx.releases);
    if (url.includes("/git/trees/master?recursive=true")) return json(fx.tree);
    if (url.endsWith("/raw/branch/master/README.md")) return { ok: true, status: 200, text: async () => "# Asura's Wrath Recompiled" };
    return { ok: false, status: 404, json: async () => null, text: async () => "" };
  });
  const c = await fetchRepoContext({ owner: "BoundlessWizard", repo: "asura-wrath-recomp" });
  assert.equal(c.host, "codeberg"); assert.equal(c.fullName, "BoundlessWizard/asura-wrath-recomp"); assert.equal(c.defaultBranch, "master");
  assert.equal(c.readme, "# Asura's Wrath Recompiled");
  assert.deepEqual(c.tree, ["README.md", "src/main.cpp"]); assert.equal(c.treeTruncated, false);
  assert.equal(c.rawBase, "https://codeberg.org/BoundlessWizard/asura-wrath-recomp/raw/branch/master/");
  assert.equal(c.zipballUrl, "https://codeberg.org/BoundlessWizard/asura-wrath-recomp/archive/master.zip");
  const [r] = c.releases;
  assert.deepEqual(Object.keys(r).sort(), ["assets", "name", "prerelease", "publishedAt", "tag", "url"]);
  assert.equal(r.tag, "v0.3.2"); assert.equal(r.prerelease, true);
  assert.deepEqual(r.assets[1], { name: "asura_wrath_recomp_windows_x86_64.zip", size: 26889654, url: "https://codeberg.org/BoundlessWizard/asura-wrath-recomp/releases/download/v0.3.2/asura_wrath_recomp_windows_x86_64.zip", digest: null });
  assert.ok(seen.every((u) => u.startsWith("https://codeberg.org/")));
});
