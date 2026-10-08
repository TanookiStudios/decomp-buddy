import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDeepLink } from "../src/deeplink.js";

test("deep links: only well-formed repo adds get through", () => {
  assert.deepEqual(parseDeepLink("decompbuddy://add?repo=HarbourMasters%2F2ship2harkinian"), { repoUrl: "https://github.com/HarbourMasters/2ship2harkinian", repo: "HarbourMasters/2ship2harkinian", host: "github", game: null });
  assert.equal(parseDeepLink("decompbuddy://add?repo=a/b&game=Banjo-Kazooie").game, "Banjo-Kazooie");
  assert.equal(parseDeepLink("decompbuddy://add?repo=a/b&host=gitlab").repoUrl, "https://gitlab.com/a/b");
  for (const bad of ["decompbuddy://run?repo=a/b", "decompbuddy://add?repo=../../etc", "decompbuddy://add?repo=a/b/c", "https://add?repo=a/b", "decompbuddy://add?repo=a%20b/c", "nonsense"]) assert.equal(parseDeepLink(bad), null, bad);
});
