import { test } from "node:test";
import assert from "node:assert/strict";
import { humanize } from "../src/sources/github-user.js";
import { makeSource as listSource } from "../src/sources/list-url.js";
import { isNewer, checkForUpdate } from "../src/updates.js";

test("github-user humanizes repo names", () => {
  assert.equal(humanize("valkyrie-profile-recomp"), "Valkyrie Profile");
  assert.equal(humanize("Skate3Recomp"), "Skate3");
  assert.equal(humanize("syphon-filter-2-recompiled"), "Syphon Filter 2");
});

test("list-url source pulls unique GitHub repos out of any text", async () => {
  const text = "see https://github.com/a/one and https://github.com/a/one/releases plus [x](https://github.com/B/Two.git) not https://github.com/sponsors/x";
  const src = listSource("data:text/plain," + encodeURIComponent(text));
  const games = await src.fetchSource();
  assert.deepEqual(games.map((g) => g.id).sort(), ["github:a/one", "github:b/two"]);
  assert.equal(games.find((g) => g.id === "github:b/two").repo, "Two");
});

test("update check compares versions sanely and reads the feed", async () => {
  assert.ok(isNewer("0.12.0", "0.11.0")); assert.ok(isNewer("1.0.0", "0.99.9")); assert.ok(!isNewer("0.11.0", "0.11.0")); assert.ok(!isNewer("v0.10.2", "0.11.0"));
  const feed = { version: "9.9.9", notes: "big", downloads: { "macos-arm64": "https://x/mac.dmg", windows: "https://x/win.exe" } };
  const r = await checkForUpdate("0.11.0", { url: "data:application/json," + encodeURIComponent(JSON.stringify(feed)), target: "macos-arm64" });
  assert.equal(r.available, true); assert.equal(r.url, "https://x/mac.dmg");
  const same = await checkForUpdate("9.9.9", { url: "data:application/json," + encodeURIComponent(JSON.stringify(feed)) });
  assert.equal(same.available, false);
});
