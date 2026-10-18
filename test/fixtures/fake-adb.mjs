#!/usr/bin/env node
// A stand-in for Google's adb, for tests and smokes (DECOMP_ADB points here). Records every call as one
// JSON line in FAKE_ADB_LOG and prints what a real adb would for a plugged-in, allowed Meta Quest 3.
// FAKE_ADB_DEVICES replaces the `adb devices -l` output; FAKE_ADB_PKG is the package the .apk installs.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (!args.length) process.exit(0); // `node --test` runs every .mjs under test/ with no arguments: nothing to answer
const logFile = process.env.FAKE_ADB_LOG;
const pkg = process.env.FAKE_ADB_PKG || "com.drbeef.questzdoom";
const calls = () => { try { return fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const last = (word) => calls().findLastIndex((x) => x.includes(word));
const installed = () => last("install") > last("uninstall");
if (logFile) fs.appendFileSync(logFile, JSON.stringify(args) + "\n");
const out = (s) => { process.stdout.write(s); process.exit(0); };
const fail = (s) => { process.stderr.write(s + "\n"); process.exit(1); };

const a = args[0] === "-s" ? args.slice(2) : args;
if (a[0] === "devices") out(process.env.FAKE_ADB_DEVICES ?? "List of devices attached\n2G0YC1ZF8B0J4K         device usb:1-1 product:eureka model:Quest_3 device:eureka transport_id:3\n\n");
if (a[0] === "shell" && /getprop/.test(a[1])) out("Oculus\nQuest 3\narm64-v8a\n");
if (a[0] === "shell" && /pm list packages/.test(a[1])) out(`package:com.oculus.browser\n${installed() ? `package:${pkg}\n` : ""}`);
if (a[0] === "shell" && a[1] === "monkey") out("  bash arg: -p\nEvents injected: 1\n");
if (a[0] === "install") { if (!fs.existsSync(a.at(-1))) fail(`adb: failed to stat ${a.at(-1)}: No such file or directory`); out("Performing Streamed Install\nSuccess\n"); }
if (a[0] === "push") { if (!fs.existsSync(a[1])) fail(`adb: error: cannot stat '${a[1]}': No such file or directory`); out(`${a[1]}: 1 file pushed, 0 skipped.\n`); }
if (a[0] === "pull") { const to = path.join(a[2], path.posix.basename(a[1])); fs.mkdirSync(to, { recursive: true }); fs.writeFileSync(path.join(to, "save.dat"), "saved game"); out(`${a[1]}/: 1 file pulled, 0 skipped.\n`); }
if (a[0] === "uninstall") out("Success\n");
fail(`fake adb: no canned answer for ${args.join(" ")}`);
