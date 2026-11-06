import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkTools, buildSystemOf, findBuiltExecutable, buildFromSource } from "../src/builder.js";
import { ensureBuildTools } from "../src/buildtools.js";

test("tool check reports each tool with an install hint", () => {
  const t = checkTools();
  assert.ok(t.find((x) => x.name === "cmake").install.length > 5);
  assert.ok(t.every((x) => typeof x.ok === "boolean"));
});

test("build system detection and executable pick", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "bld-"));
  assert.equal(buildSystemOf(d), null);
  fs.writeFileSync(path.join(d, "CMakeLists.txt"), ""); assert.equal(buildSystemOf(d), "cmake");
  fs.mkdirSync(path.join(d, "build", "CMakeFiles"), { recursive: true });
  fs.writeFileSync(path.join(d, "build", "game"), Buffer.alloc(60_000), { mode: 0o755 });
  fs.writeFileSync(path.join(d, "build", "CMakeFiles", "junk"), Buffer.alloc(60_000), { mode: 0o755 });
  assert.equal(path.basename(findBuiltExecutable(path.join(d, "build"), "game")), "game");
});

test("a real tiny CMake project builds end to end when the toolchain is present", async (t) => {
  const tools = checkTools();
  if (!tools.find((x) => x.name === "cmake").ok || !tools.find((x) => x.name === "git").ok) { t.skip("no cmake/git here"); return; }
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "bld2-")); const repo = path.join(d, "repo"); fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, "CMakeLists.txt"), 'cmake_minimum_required(VERSION 3.10)\nproject(hello C)\nadd_executable(hello main.c)\n');
  fs.writeFileSync(path.join(repo, "main.c"), 'int main(void){return 0;}\n');
  const { execFileSync } = await import("node:child_process");
  execFileSync("git", ["init", "-q"], { cwd: repo }); execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "add", "."], { cwd: repo }); execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x"], { cwd: repo });
  const out = path.join(d, "game"); fs.mkdirSync(out);
  const lines = [];
  const r = await buildFromSource({ repoUrl: repo, dir: out, hint: "hello", log: (l) => lines.push(l) });
  assert.equal(path.basename(r.executable), "hello");
  assert.ok(fs.existsSync(r.executable));
  assert.ok(lines.some((l) => /cmake --build/.test(l)));
});

test("CMake and Ninja: fetched once by exact checksum, nothing kept after a bad download, none on Windows", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bldtools-")), asked = [];
  const get = async (url, file, log, { digest }) => { asked.push([url, digest]); fs.writeFileSync(file, "x"); };
  const unpack = async (file, to) => { fs.mkdirSync(to, { recursive: true }); fs.writeFileSync(path.join(to, "ninja"), ""); };
  const bad = fs.mkdtempSync(path.join(os.tmpdir(), "bldtools-"));
  await assert.rejects(ensureBuildTools(bad, { platform: "linux", arch: "x64", get: async () => { throw new Error("offline"); }, unpack }), /offline/);
  assert.deepEqual(fs.readdirSync(bad), [], "a failed download leaves nothing that looks finished");
  const bins = await ensureBuildTools(dir, { platform: "linux", arch: "x64", get, unpack });
  assert.equal(asked.length, 2); assert.equal(bins.length, 2);
  assert.ok(asked.every(([url, digest]) => /^https:\/\/github\.com\/(Kitware|ninja-build)\//.test(url) && /^sha256:[0-9a-f]{64}$/.test(digest)));
  await ensureBuildTools(dir, { platform: "linux", arch: "x64", get, unpack });
  assert.equal(asked.length, 2, "the second build downloads nothing");
  assert.deepEqual(await ensureBuildTools(dir, { platform: "win32", arch: "x64", get, unpack }), []);
});
