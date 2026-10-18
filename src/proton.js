// Windows games on Linux and Steam Deck: the Proton builds Steam already has, umu-run, or plain Wine.
// Nothing is downloaded here - Decomp Buddy uses what's on the computer, and says so when there's nothing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// libraryfolders.vdf (text VDF): every Steam library's "path".
export function libraryPaths(vdf) {
  return [...String(vdf || "").matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\\\/g, "\\"));
}

const onPath = (name, env) => (env.PATH || "").split(path.delimiter).filter(Boolean).map((d) => path.join(d, name)).find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } }) || null;

// Every way this computer can run a Windows program: [{ id, kind: "proton"|"wine", label, path, protonDir? }].
// Proton comes from each Steam library's steamapps/common/Proton* and from compatibilitytools.d (GE-Proton and friends).
export function findRunners({ steamRoot = null, home = os.homedir(), env = process.env } = {}) {
  const roots = [...new Set([steamRoot, path.join(home, ".steam", "root"), path.join(home, ".steam", "steam"), path.join(home, ".local", "share", "Steam"),
    path.join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam")].filter((d) => d && fs.existsSync(d)).map((d) => fs.realpathSync(d)))];
  const libs = new Set(roots);
  for (const r of roots) { try { for (const p of libraryPaths(fs.readFileSync(path.join(r, "steamapps", "libraryfolders.vdf"), "utf8"))) libs.add(p); } catch {} }
  const out = [], seen = new Set();
  const add = (dir, label) => {
    const script = path.join(dir, "proton");
    if (!fs.existsSync(script)) return;
    const real = fs.realpathSync(dir); if (seen.has(real)) return; seen.add(real);
    out.push({ id: `proton:${path.basename(dir)}`, kind: "proton", label, path: script, protonDir: dir });
  };
  for (const lib of libs) { const c = path.join(lib, "steamapps", "common"); try { for (const n of fs.readdirSync(c)) if (/^Proton/i.test(n)) add(path.join(c, n), n); } catch {} }
  for (const r of roots) { const c = path.join(r, "compatibilitytools.d"); try { for (const n of fs.readdirSync(c)) add(path.join(c, n), n); } catch {} }
  // Newest first: "Proton - Experimental" and GE builds sort by their numbers.
  out.sort((a, b) => b.label.localeCompare(a.label, "en", { numeric: true }));
  const wine = onPath("wine", env); if (wine) out.push({ id: "wine", kind: "wine", label: "Wine (installed on this computer)", path: wine });
  return out;
}

export const umuPath = (env = process.env) => onPath("umu-run", env);

// How to start a Windows program with a runner. Proton goes through umu-run when it's installed (the supported way to
// run Proton outside Steam); otherwise straight through Proton's own script, which Steam's runtime normally wraps.
export function compatLaunchSpec(runner, exe, { args = [], prefix, steamRoot = null, umu = null, env = process.env } = {}) {
  const spec = compatSpec(runner, exe, { args, prefix, steamRoot, umu, env });
  // Inside the Flatpak, Proton and Wine live on the host: run them there, passing the variables they need.
  if (!env.DECOMP_FLATPAK) return spec;
  const vars = ["WINEPREFIX", "WINEDEBUG", "PROTONPATH", "GAMEID", "STEAM_COMPAT_DATA_PATH", "STEAM_COMPAT_CLIENT_INSTALL_PATH"].filter((k) => spec.opts.env[k] !== undefined).map((k) => `--env=${k}=${spec.opts.env[k]}`);
  return { cmd: "flatpak-spawn", argv: ["--host", `--directory=${spec.opts.cwd}`, ...vars, spec.cmd, ...spec.argv], opts: spec.opts };
}
function compatSpec(runner, exe, { args, prefix, steamRoot, umu, env }) {
  const opts = (extra) => ({ cwd: path.dirname(exe), env: { ...env, ...extra } });
  if (runner.kind === "wine") return { cmd: runner.path, argv: [exe, ...args], opts: opts({ WINEPREFIX: prefix, WINEDEBUG: "-all" }) };
  fs.mkdirSync(prefix, { recursive: true });
  if (umu) return { cmd: umu, argv: [exe, ...args], opts: opts({ WINEPREFIX: path.join(prefix, "pfx"), PROTONPATH: runner.protonDir, GAMEID: "umu-0" }) };
  return { cmd: runner.path, argv: ["run", exe, ...args], opts: opts({ STEAM_COMPAT_DATA_PATH: prefix, STEAM_COMPAT_CLIENT_INSTALL_PATH: steamRoot || "" }) };
}

// The runner a game uses: the one you picked for it if it's still here, else the newest Proton, else Wine.
export const pickRunner = (runners, chosenId) => runners.find((r) => r.id === chosenId) || runners[0] || null;
