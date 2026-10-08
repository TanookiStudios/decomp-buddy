import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makePack, packSize } from "../src/offlinepack.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "db-pack-"));
const pe = (...dlls) => Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100), Buffer.from(dlls.join("\0"), "latin1")]);
function game(root, folder, target, files) {
  const d = path.join(root, folder); fs.mkdirSync(d, { recursive: true });
  for (const [n, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, n)), { recursive: true }); fs.writeFileSync(path.join(d, n), c); }
  fs.writeFileSync(path.join(d, "decomp-buddy.json"), JSON.stringify({ setUpAt: "2026-09-01T00:00:00Z", target, repo: "a/b", repoUrl: "u", folder, status: "ready", release: { tag: "v2", files: [] }, plan: { game_title: folder, console: "N64", build: { method: "release", executable: null }, game_files: [], notes: [] } }));
  return d;
}

test("offline pack: games without old versions, install.html, runtimes they need, the app, START HERE", async () => {
  const lib = tmp(), dest = tmp();
  const a = game(lib, "Zelda", "windows", { "zelda.exe": pe("MSVCP140.dll"), "Versions/v1/old.exe": "old", ".decomp-buddy-nightly/x": "x", ".DS_Store": "junk" });
  const b = game(lib, "Mario", "macos-arm64", { "Mario.app/Contents/x": "y" });
  const got = [];
  const download = async (url, dest) => { got.push(url); fs.writeFileSync(dest, "installer"); };
  const fetchJson = async () => ({ downloads: { "windows-portable": "https://x/Decomp%20Buddy%200.29.0%20Portable.exe" } });
  assert.ok(packSize([a, b]) > 0);
  const r = await makePack({ folders: [a, b], destRoot: dest, includeApp: true, download, fetchJson, now: new Date("2026-09-29T00:00:00Z"), latestUrl: "u" });
  assert.equal(path.basename(r.dir), "Decomp Buddy Offline Pack 2026-09-29");
  assert.ok(fs.existsSync(path.join(r.dir, "Zelda", "zelda.exe")));
  assert.ok(!fs.existsSync(path.join(r.dir, "Zelda", "Versions")) && !fs.existsSync(path.join(r.dir, "Zelda", ".decomp-buddy-nightly")) && !fs.existsSync(path.join(r.dir, "Zelda", ".DS_Store")));
  assert.ok(fs.readFileSync(path.join(r.dir, "install.html"), "utf8").includes("Zelda"));
  assert.ok(fs.existsSync(path.join(r.dir, "Apply Icons.bat")));
  assert.deepEqual(r.runtimes, ["Visual C++ Runtime"]);
  assert.ok(fs.existsSync(path.join(r.dir, "Windows Runtimes", "1 - Visual C++ Runtime (vc_redist.x64).exe")));
  assert.equal(r.app, "Decomp Buddy 0.29.0 Portable.exe");
  const start = fs.readFileSync(path.join(r.dir, "START HERE.txt"), "utf8");
  assert.match(start, /Visual C\+\+ Runtime/); assert.match(start, /Apply Icons\.bat/); assert.match(start, /not for sharing/);
  await assert.rejects(makePack({ folders: [a], destRoot: dest, download, fetchJson, now: new Date("2026-09-29T00:00:00Z") }), /already there/);
});
