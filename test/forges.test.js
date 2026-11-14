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
  assert.equal(parseRepoUrl("https://github.com/o/r.git").repo, "r");
  assert.equal(refFromUrl("https://evil.example/o/r"), null);
});
