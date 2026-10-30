import { test } from "node:test";
import assert from "node:assert/strict";
import { featureMentions } from "../src/features.js";

test("finds the sentences that might claim a feature, one sentence each", () => {
  const f = featureMentions("# Port\nRuns at 60 FPS with widescreen support. Includes split-screen for two players.\n\nThe ROM is not included.");
  assert.deepEqual(Object.keys(f).sort(), ["coop", "fps60", "widescreen"]);
  assert.equal(f.fps60[0], "Runs at 60 FPS with widescreen support.");
  assert.deepEqual(featureMentions("Nothing special here. Just a decomp."), {});
});
test("doesn't take a version number or a URL for a feature", () => {
  assert.deepEqual(Object.keys(featureMentions("Version 1.60 fixes crashes. See https://example.com/4k-guide for more.")), []);
});

import { underNotYetHeading } from "../src/features.js";
test("a feature under a Planned or Roadmap heading isn't a badge, unless the line says it's done", () => {
  const md = "# Banjo\n## Features\n* Widescreen support\n## Planned Features\n* Ray Tracing via RT64\n## Roadmap\n| High refresh rate | ✅ Done |\n";
  assert.equal(underNotYetHeading(md, "Ray Tracing via RT64"), true);
  assert.equal(underNotYetHeading(md, "Widescreen support"), false);
  assert.equal(underNotYetHeading(md, "High refresh rate"), false);
  assert.equal(underNotYetHeading("# Jet Set Radio Future\nRuns at 60 fps", "Runs at 60 fps"), false);
});
