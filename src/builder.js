// Build a decomp from source on this machine: tool check, then a fixed CMake recipe
// (never model-written commands), live log, cancellable, and an honest failure report.

import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";

const TOOLS = [
  { name: "git", check: ["git", "--version"], mac: "brew install git", linux: "sudo apt install git" },
  { name: "cmake", check: ["cmake", "--version"], mac: "brew install cmake", linux: "sudo apt install cmake" },
  { name: "ninja", check: ["ninja", "--version"], mac: "brew install ninja", linux: "sudo apt install ninja-build", optional: true },
  { name: "clang", check: ["clang", "--version"], mac: "xcode-select --install", linux: "sudo apt install clang" },
  { name: "pkg-config", check: ["pkg-config", "--version"], mac: "brew install pkg-config", linux: "sudo apt install pkg-config", optional: true },
];
const PATH_EXTRA = `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`;

export function checkTools() {
  return TOOLS.map((t) => {
    let ok = false;
    try { execFileSync(t.check[0], t.check.slice(1), { stdio: "ignore", env: { ...process.env, PATH: PATH_EXTRA } }); ok = true; } catch {}
    return { name: t.name, ok, optional: !!t.optional, install: process.platform === "darwin" ? t.mac : t.linux };
  });
}

export function buildSystemOf(srcDir) {
  if (fs.existsSync(path.join(srcDir, "CMakeLists.txt"))) return "cmake";
  if (fs.existsSync(path.join(srcDir, "meson.build"))) return "meson";
  if (fs.existsSync(path.join(srcDir, "Makefile")) || fs.existsSync(path.join(srcDir, "makefile"))) return "make";
  return null;
}
// Some repos keep the project one folder down (e.g. strikers/smstrikers-port). Find where the build files live.
export function projectRoot(srcDir) {
  if (buildSystemOf(srcDir)) return srcDir;
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith(".") && buildSystemOf(path.join(srcDir, e.name))) return path.join(srcDir, e.name);
  return srcDir;
}

// Newest executable under build/, preferring the name the plan mentioned.
export function findBuiltExecutable(root, hint) {
  const out = [];
  const walk = (d, depth = 0) => { if (depth > 5) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (/\.app$/.test(e.name)) out.push(p); else if (!/^(CMakeFiles|\.git|_deps|node_modules)$/.test(e.name)) walk(p, depth + 1); } else { try { fs.accessSync(p, fs.constants.X_OK); if (!/\.(sh|py|o|a|so|dylib|cmake|txt|json|ninja)$/i.test(e.name) && fs.statSync(p).size > 8_000) out.push(p); } catch {} } } };
  walk(root);
  const want = hint ? String(hint).toLowerCase().replace(/\.(exe|app)$/, "") : null;
  const byHint = want && out.find((p) => path.basename(p).toLowerCase().replace(/\.app$/, "") === want);
  return byHint || out.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

// Run one step, streaming output. Returns a promise; kill() aborts.
function step(cmd, args, cwd, log, state) {
  return new Promise((resolve, reject) => {
    log(`$ ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, { cwd, env: { ...process.env, PATH: PATH_EXTRA }, stdio: ["ignore", "pipe", "pipe"] });
    state.child = child;
    const onData = (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => log(l));
    child.stdout.on("data", onData); child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("close", (code, signal) => { state.child = null; if (state.cancelled) reject(new Error("Cancelled")); else if (code === 0) resolve(); else reject(new Error(`${cmd} exited with ${code ?? signal}`)); });
  });
}

// Full recipe. Returns { executable, log }. Throws with the failing step named.
export async function buildFromSource({ repoUrl, dir, hint, log = () => {}, state = {} }) {
  const src = path.join(dir, "Source");
  const missing = checkTools().filter((t) => !t.ok && !t.optional);
  if (missing.length) throw new Error(`Missing tools: ${missing.map((t) => `${t.name} (${t.install})`).join("; ")}. Install them and try again.`);
  let where = "clone";
  try {
    if (!fs.existsSync(path.join(src, ".git"))) { fs.rmSync(src, { recursive: true, force: true }); await step("git", ["clone", "--recursive", "--depth", "1", repoUrl, src], dir, log, state); }
    else await step("git", ["pull", "--ff-only"], src, log, state);
    const proj = projectRoot(src);
    const sys = buildSystemOf(proj);
    if (!sys) throw new Error("No CMakeLists.txt, meson.build or Makefile in the source - this project's build isn't one the app knows.");
    const build = path.join(proj, "build");
    if (sys === "cmake") {
      where = "configure";
      const gen = checkTools().find((t) => t.name === "ninja")?.ok ? ["-G", "Ninja"] : [];
      await step("cmake", ["-S", proj, "-B", build, "-DCMAKE_BUILD_TYPE=Release", ...gen], proj, log, state);
      where = "build";
      await step("cmake", ["--build", build, "--config", "Release", "-j"], proj, log, state);
    } else if (sys === "meson") {
      where = "configure"; await step("meson", ["setup", build, "--buildtype=release"], proj, log, state);
      where = "build"; await step("ninja", ["-C", build], proj, log, state);
    } else { where = "build"; await step("make", ["-j"], proj, log, state); }
    where = "collect";
    const exe = findBuiltExecutable(sys === "make" ? proj : build, hint);
    if (!exe) throw new Error("Build finished but no executable was found under the build folder.");
    const dest = path.join(dir, path.basename(exe));
    if (/\.app$/.test(exe)) fs.cpSync(exe, dest, { recursive: true }); else fs.copyFileSync(exe, dest);
    log(`Built: ${dest}`);
    return { executable: dest };
  } catch (err) {
    throw new Error(`Build failed at the ${where} step: ${err.message}`);
  }
}
