import { test } from "node:test";
import assert from "node:assert/strict";
import { scrub, reportBody, issueUrl } from "../src/bugreport.js";

test("the player's home folder never appears, on any system", () => {
  assert.equal(scrub("open /Users/maddie/Games/z64/baserom.z64 failed", "/Users/maddie"), "open ~/Games/z64/baserom.z64 failed");
  assert.equal(scrub("C:\\Users\\Maddie\\Games\\x.exe crashed", ""), "~\\Games\\x.exe crashed");
  assert.equal(scrub("/home/deck/.local/share/x: no such file"), "~/.local/share/x: no such file");
  assert.doesNotMatch(reportBody({ title: "Zelda", tail: "Loading /Users/maddie/a.z64\nboom", home: "/Users/maddie", platform: "darwin", appVersion: "0.31.0" }), /maddie/i);
});

test("the body says what a developer needs", () => {
  const b = reportBody({ title: "Zelda 64", tag: "v1.2", platform: "linux", arch: "x64", appVersion: "0.31.0", exit: "exit code 1", tail: "a\nb\nVK_ERROR" });
  for (const want of ["Zelda 64 (v1.2)", "Linux (x64)", "exit code 1", "VK_ERROR", "Decomp Buddy 0.31.0"]) assert.ok(b.includes(want), want);
});

test("new-issue pages on GitHub, Codeberg and GitLab", () => {
  assert.match(issueUrl("https://github.com/Zelda64Recomp/Zelda64Recomp", "T", "B"), /^https:\/\/github\.com\/Zelda64Recomp\/Zelda64Recomp\/issues\/new\?title=T&body=B$/);
  assert.match(issueUrl("https://codeberg.org/a/b.git", "T", "B"), /^https:\/\/codeberg\.org\/a\/b\/issues\/new\?/);
  assert.match(issueUrl("https://gitlab.com/a/b", "T", "B"), /^https:\/\/gitlab\.com\/a\/b\/-\/issues\/new\?issue%5Btitle%5D=T/);
  assert.equal(issueUrl("https://example.com/a/b", "T", "B"), null);
  assert.equal(issueUrl("not a url", "T", "B"), null);
});
