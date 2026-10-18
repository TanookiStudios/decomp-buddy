import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { toAnalysis, brief, planViaApple } from "../src/appleai.js";

const ctx = { fullName: "a/GameRecomp", description: "A recomp", readme: "x".repeat(9000), releases: [{ tag: "v1.0", assets: [{ name: "Game-v1.0-Windows.zip" }, { name: "Game-v1.0-Linux.tar.gz" }] }] };

test("apple: an answer becomes a full plan only when its download really exists", () => {
  const a = toAnalysis({ game_title: "Game", console: "Nintendo 64", release_asset: "game-v1.0-windows.zip", executable: "build\\bin\\Game.exe", game_file_formats: ["z64", ".N64", "ROM", "disc image"], first_run: ["Run it"] }, ctx);
  const g = a.games[0];
  assert.equal(g.build.method, "release"); assert.equal(g.build.release_asset, "Game-v1.0-Windows.zip"); assert.equal(g.build.release_tag, "v1.0");
  assert.equal(g.build.executable, "Game.exe");
  assert.deepEqual(g.game_files[0].accepted_formats, [".z64", ".n64"]);
  assert.equal(g.confidence, "low");
  const made = toAnalysis({ game_title: "Game", release_asset: "Game-Windows-Final.zip" }, ctx).games[0];
  assert.equal(made.build.method, "unsupported"); assert.equal(made.build.release_asset, null);
});

test("apple: the brief fits the small model - README cut, releases listed, target named", () => {
  const b = brief(ctx, { target: "windows" });
  assert.ok(b.length < 6400, `brief is ${b.length} chars`);
  assert.match(b, /v1\.0: Game-v1\.0-Windows\.zip, Game-v1\.0-Linux\.tar\.gz/); assert.match(b, /Target computer: Windows x64/);
});

test("apple: a README too long for the model is retried shorter; a made-up download is refused", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "appleai-")), bin = path.join(dir, "fake-ai"), seen = path.join(dir, "sizes");
  // Fake helper: refuses (exit 3) the first, long prompt; answers the shorter retry.
  fs.writeFileSync(bin, `#!/bin/sh\nbody=$(cat); n=\${#body}; echo $n >> "${seen}"\nif [ $n -gt 4000 ]; then echo "too long" >&2; exit 3; fi\necho '{"game_title":"Game","console":"N64","release_asset":"Game-v1.0-Windows.zip","executable":"Game.exe","game_file_formats":[".z64"],"first_run":["Run Game.exe"]}'\n`, { mode: 0o755 });
  const a = await planViaApple(ctx, { target: "windows", bin });
  assert.equal(a.games[0].build.release_asset, "Game-v1.0-Windows.zip");
  assert.equal(fs.readFileSync(seen, "utf8").trim().split("\n").length, 2, "one refusal, one shorter retry");
  fs.writeFileSync(bin, `#!/bin/sh\ncat >/dev/null; echo '{"game_title":"Game","release_asset":"nope.zip"}'\n`, { mode: 0o755 });
  await assert.rejects(planViaApple(ctx, { target: "windows", bin }), /couldn't find a Windows PC download/);
});

test("apple: every Mac that can't run it reports 'not available' instead of breaking", async () => {
  const { status } = await import("../src/appleai.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "appleai-off-"));
  const fake = (name, body, mode = 0o755) => { const p = path.join(dir, name); fs.writeFileSync(p, body, { mode }); return p; };
  // Apple Intelligence switched off (or still downloading): the helper says so.
  const off = await status({ bin: fake("off", `#!/bin/sh\necho '{"available":false,"reason":"appleIntelligenceNotEnabled"}'\n`) });
  assert.equal(off.available, false); assert.match(off.reason, /NotEnabled/);
  // Older macOS: the loader refuses a binary built for macOS 26 before main() runs.
  const old = await status({ bin: fake("old", `#!/bin/sh\necho "dyld: Symbol not found: FoundationModels" >&2\nexit 134\n`) });
  assert.equal(old.available, false); assert.match(old.reason, /Apple silicon and macOS 26/);
  // Intel Mac: an arm64-only file the kernel won't run (a non-executable stands in for "Bad CPU type").
  const intel = await status({ bin: fake("intel", "\x7fELF not a mac binary", 0o644) });
  assert.equal(intel.available, false);
  // Helper missing from the app bundle.
  const gone = await status({ bin: path.join(dir, "nope") });
  assert.equal(gone.available, false);
  // Not a Mac: never even looks for the helper.
  const real = process.platform; Object.defineProperty(process, "platform", { value: "win32" });
  try { const win = await status({ bin: fake("never", `#!/bin/sh\necho '{"available":true}'\n`) }); assert.equal(win.available, false); }
  finally { Object.defineProperty(process, "platform", { value: real }); }
});
