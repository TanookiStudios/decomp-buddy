// Real ride: install Wine into a throwaway tools folder and run a console command with no display
// driver (winemac.drv disabled), so nothing appears on screen.
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { installWine, wineStatus, rosettaReady, wineLaunchSpec, prefixFor } from "../../src/wine.js";
import { download } from "../../src/setup.js";
const tools = path.join(os.homedir(), ".decomp-buddy-smoke", "wine", "tools");
const t0 = Date.now();
console.log("rosetta", rosettaReady());
let st = wineStatus(tools);
if (!st.installed) st = await installWine(tools, { download, log: (m) => { if (!/%/.test(m)) console.log(m); } });
console.log("installed", JSON.stringify(wineStatus(tools)), `${Math.round((Date.now() - t0) / 1000)}s`);
const bin = wineStatus(tools).bin;
const v = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 60_000 }); console.log("version:", (v.stdout || v.stderr).trim());
const prefix = prefixFor(path.join(os.homedir(), ".decomp-buddy-smoke", "wine", "prefixes"), "/tmp/fake-game");
const spec = wineLaunchSpec(bin, "cmd", { args: ["/c", "ver"], prefix, headless: true });
const t1 = Date.now();
const r = spawnSync(spec.cmd, spec.argv, { ...spec.opts, cwd: os.tmpdir(), encoding: "utf8", timeout: 300_000 });
console.log("cmd /c ver ->", JSON.stringify((r.stdout || "").trim()), "exit", r.status, `${Math.round((Date.now() - t1) / 1000)}s`, (r.stderr || "").split("\n").filter(Boolean).slice(-3).join(" | "));
console.log("prefix made:", fs.existsSync(path.join(prefix, "drive_c")));
