import { test } from "node:test";
import assert from "node:assert/strict";
import { people } from "../src/credits.js";

test("Made By: people only, top 12, plain avatar address", () => {
  const list = [{ login: "dependabot[bot]", type: "Bot", contributions: 900 }, { login: "github-actions[bot]", type: "User", contributions: 50 },
    { login: "Mr-Wiseguy", type: "User", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4", contributions: 300 },
    ...Array.from({ length: 20 }, (_, i) => ({ login: `p${i}`, type: "User", contributions: 20 - i }))];
  const out = people(list);
  assert.equal(out.length, 12);
  assert.deepEqual(out[0], { login: "Mr-Wiseguy", avatar: "https://avatars.githubusercontent.com/u/1", n: 300 });
  assert.ok(!out.some((p) => /bot/i.test(p.login)));
  assert.deepEqual(people(null), []);
  const named = people(["ImgBotApp", "OpenGOALBot", "OpenRCT2-git-bot", "rhoggs-bot-test-account", "Ibot02", "botanicvelious"].map((login) => ({ login, type: "User" })));
  assert.deepEqual(named.map((p) => p.login), ["Ibot02", "botanicvelious"]);
});
