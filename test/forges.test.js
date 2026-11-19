import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DOMAIN, refFromUrl } from "../src/forges.js";
import { parseRepoUrl } from "../src/github.js";
import { HOSTS } from "../src/hosts.js";
import { queueKey } from "../scripts/triage.mjs";

test("forges: the screens' list of project sites is the same as the app's", () => {
  const m = fs.readFileSync(new URL("../renderer/app.js", import.meta.url), "utf8").match(/const HOST_SITE = (\{[^}]*\});/);
  assert.deepEqual(JSON.parse(m[1].replace(/(\w+): "/g, '"$1": "')), Object.fromEntries(Object.entries(DOMAIN).map(([k, d]) => [k, `https://${d}`])));
});

test("forges: a Forgejo site in the table works everywhere a Codeberg link does", () => {
  const url = "https://git.notrexed.dev/Hookshot/Hookshot";
  assert.deepEqual(refFromUrl(url), { host: "notrexed", owner: "Hookshot", repo: "Hookshot" });
  assert.deepEqual(parseRepoUrl(url), { host: "notrexed", owner: "Hookshot", repo: "Hookshot" });
  assert.equal(queueKey(url), "notrexed:Hookshot/Hookshot");
  assert.equal(HOSTS.notrexed.domain, "git.notrexed.dev");
  assert.equal(queueKey("https://git.magicbean.dev/MagicBeanDev/Longshot"), "magicbean:MagicBeanDev/Longshot");
  assert.equal(parseRepoUrl("https://github.com/o/r.git").repo, "r");
  assert.equal(refFromUrl("https://evil.example/o/r"), null);
});

test("forges: a Forgejo/Gitea site nobody added is known by its address, with no app update", async () => {
  const { anyRefFromUrl, siteOf, isForgejo } = await import("../src/forges.js");
  const { hostOf } = await import("../src/hosts.js");
  const url = "https://git.example.org/Maddie/MyPort/releases";
  assert.deepEqual(parseRepoUrl(url), { host: "git.example.org", owner: "Maddie", repo: "MyPort" });
  assert.equal(queueKey(url), "git.example.org:Maddie/MyPort");
  assert.equal(siteOf("git.example.org"), "https://git.example.org");
  assert.equal(hostOf("git.example.org").raw("Maddie", "MyPort", "README.md"), "https://git.example.org/Maddie/MyPort/raw/HEAD/README.md");
  assert.ok(isForgejo("git.example.org"));
  // A known site keeps its own id; an address is never a GitHub/GitLab stand-in; no IPs, no localhost.
  assert.equal(anyRefFromUrl("https://git.notrexed.dev/a/b").host, "notrexed");
  assert.equal(anyRefFromUrl("https://www.github.com/a/b").host, "github");
  for (const bad of ["https://192.168.1.4/a/b", "https://localhost/a/b", "http://10.0.0.1:3000/a/b", "https://example.org/a", "https://x.example/../b"]) assert.equal(anyRefFromUrl(bad), null, bad);
  assert.throws(() => hostOf("localhost"));
  // Links found inside pages stay strict: a random site's link isn't taken for a project.
  assert.equal(refFromUrl(url), null);
});
