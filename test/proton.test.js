import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { libraryPaths, findRunners, compatLaunchSpec, pickRunner } from "../src/proton.js";

const touch = (p, mode = 0o755) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, "#!/bin/sh\n", { mode }); };

test("Steam libraries are read from libraryfolders.vdf", () => {
  const vdf = `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"/home/deck/.local/share/Steam"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"/run/media/deck/SD Card"\n\t}\n}`;
  assert.deepEqual(libraryPaths(vdf), ["/home/deck/.local/share/Steam", "/run/media/deck/SD Card"]);
});

test("finds Proton in every Steam library and compatibilitytools.d, newest first, then Wine", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "proton-")), steam = path.join(home, ".local/share/Steam"), sd = path.join(home, "sdcard");
  try {
    touch(path.join(steam, "steamapps/common/Proton 8.0/proton")); touch(path.join(sd, "steamapps/common/Proton 9.0/proton"));
    touch(path.join(steam, "compatibilitytools.d/GE-Proton9-20/proton"));
    fs.mkdirSync(path.join(steam, "steamapps/common/Proton Broken"), { recursive: true }); // no proton script: skipped
    fs.writeFileSync(path.join(steam, "steamapps/libraryfolders.vdf"), `"libraryfolders" { "0" { "path" "${steam}" } "1" { "path" "${sd}" } }`);
    const bin = path.join(home, "bin"); touch(path.join(bin, "wine"));
    const r = findRunners({ home, env: { PATH: bin } });
    assert.deepEqual(r.map((x) => x.label), ["Proton 9.0", "Proton 8.0", "GE-Proton9-20", "Wine (installed on this computer)"]);
    assert.equal(pickRunner(r, "proton:GE-Proton9-20").label, "GE-Proton9-20");
    assert.equal(pickRunner(r, "proton:gone").label, "Proton 9.0");
    assert.deepEqual(findRunners({ home: path.join(home, "nobody"), env: { PATH: "" } }), []);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test("launch specs: Proton with its compat folders, umu-run when present, Wine with a prefix", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "proton-")), prefix = path.join(tmp, "pfx1");
  const proton = { kind: "proton", path: "/s/Proton 9.0/proton", protonDir: "/s/Proton 9.0" };
  const p = compatLaunchSpec(proton, "/g/Game.exe", { args: ["-w"], prefix, steamRoot: "/s", env: {} });
  assert.deepEqual([p.cmd, p.argv], ["/s/Proton 9.0/proton", ["run", "/g/Game.exe", "-w"]]);
  assert.equal(p.opts.env.STEAM_COMPAT_DATA_PATH, prefix); assert.equal(p.opts.env.STEAM_COMPAT_CLIENT_INSTALL_PATH, "/s"); assert.equal(p.opts.cwd, "/g");
  const u = compatLaunchSpec(proton, "/g/Game.exe", { prefix, umu: "/usr/bin/umu-run", env: {} });
  assert.deepEqual([u.cmd, u.argv, u.opts.env.PROTONPATH, u.opts.env.GAMEID], ["/usr/bin/umu-run", ["/g/Game.exe"], "/s/Proton 9.0", "umu-0"]);
  const w = compatLaunchSpec({ kind: "wine", path: "/usr/bin/wine" }, "/g/Game.exe", { prefix, env: {} });
  assert.deepEqual([w.cmd, w.argv, w.opts.env.WINEPREFIX], ["/usr/bin/wine", ["/g/Game.exe"], prefix]);
  // In the Flatpak the runner starts on the host, with its variables passed along.
  const f = compatLaunchSpec(proton, "/g/Game.exe", { prefix, steamRoot: "/s", env: { DECOMP_FLATPAK: "1" } });
  assert.equal(f.cmd, "flatpak-spawn"); assert.deepEqual(f.argv.slice(0, 2), ["--host", "--directory=/g"]);
  assert.ok(f.argv.includes(`--env=STEAM_COMPAT_DATA_PATH=${prefix}`)); assert.deepEqual(f.argv.slice(-3), ["/s/Proton 9.0/proton", "run", "/g/Game.exe"]);
  fs.rmSync(tmp, { recursive: true, force: true });
});
