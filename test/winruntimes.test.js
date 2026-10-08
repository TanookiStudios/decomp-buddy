import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runtimesNeeded, parseRegQuery, installedRuntimes } from "../src/winruntimes.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "db-rt-"));
const pe = (...dlls) => Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200), Buffer.from(dlls.join("\0") + "\0", "latin1")]);

test("runtimesNeeded reads the DLLs a game's programs import", () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, "game.exe"), pe("KERNEL32.dll", "MSVCP140.dll", "VCRUNTIME140_1.dll", "d3dx9_43.dll", "XINPUT1_3.dll"));
  assert.deepEqual(runtimesNeeded(d).sort(), ["directx", "vcredist"]);
});

test("a runtime shipped beside the game counts as there; .NET 8 from runtimeconfig; text files ignored", () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, "game.exe"), pe("vcruntime140.dll"));
  fs.writeFileSync(path.join(d, "vcruntime140.dll"), pe("KERNEL32.dll"));
  fs.writeFileSync(path.join(d, "readme.txt"), "needs d3dx9_43.dll");
  fs.writeFileSync(path.join(d, "Tool.runtimeconfig.json"), JSON.stringify({ runtimeOptions: { framework: { name: "Microsoft.WindowsDesktop.App", version: "8.0.0" } } }));
  assert.deepEqual(runtimesNeeded(d), ["dotnet8"]);
});

test("parseRegQuery", () => {
  const out = "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64\r\n    Installed    REG_DWORD    0x1\r\n    Version    REG_SZ    v14.44.35211.00\r\n";
  assert.deepEqual(parseRegQuery(out), { Installed: "0x1", Version: "v14.44.35211.00" });
});

test("installedRuntimes is Windows-only", async () => { assert.equal(await installedRuntimes({ platform: "darwin" }), null); });
