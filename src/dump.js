// Rip a game disc you own straight into the pending game's row. What a normal PC drive can read:
//   CD-era consoles (PS1, Saturn, Sega CD, PC Engine CD...) - raw sectors, BIN/CUE, via cdrdao
//   PS2 DVDs and PC discs - a plain ISO, via dd
// What it can't, whatever software you use: GameCube/Wii (proprietary format), original Xbox and
// Xbox 360 (security sectors), Dreamcast (GD-ROM). Those get an honest "can't" and where to go instead.
// Untested against a real disc at the time of writing - the Mac it was built on has no drive.

import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const CD_RAW = /playstation(?! 2| 3| 4| portable)|ps1|psx|saturn|sega cd|mega cd|pc engine cd|turbografx.?cd|3do|neo ?geo cd/i;
const DVD_ISO = /playstation 2|ps2|\bpc\b|windows|dos/i;
const CANT = [
  [/gamecube|\bwii\b|wii u/i, "GameCube and Wii discs use a format ordinary drives can't read. Dump them on a Wii with CleanRip (or a specific LG drive with custom firmware)."],
  [/\bxbox\b/i, "Xbox discs have security sectors PC drives can't read. Dump them from a modded console."],
  [/dreamcast/i, "Dreamcast GD-ROMs can't be read by PC drives. Dump them from a Dreamcast (e.g. with a SD adapter and a dumping tool)."],
];

export function dumpKind(consoleName) {
  for (const [re, why] of CANT) if (re.test(consoleName)) return { kind: "impossible", why };
  if (DVD_ISO.test(consoleName)) return { kind: "dvd-iso" };
  if (CD_RAW.test(consoleName)) return { kind: "cd-raw" };
  return { kind: "unknown", why: "Not a disc-based console Decomp Buddy knows how to rip." };
}

// macOS `drutil status`
export function parseDrutil(text) {
  const t = String(text || "");
  if (!t.trim()) return null;
  const type = (t.match(/Type:\s*([^\n]+?)\s{2,}|Type:\s*([^\n]+)$/m) || []).slice(1).find(Boolean)?.trim() || "";
  const dev = (t.match(/Name:\s*(\/dev\/disk\d+)/) || [])[1] || null;
  const blocks = Number((t.match(/Space Used:[^\n]*?blocks:\s*(\d+)/) || [])[1] || 0);
  const product = ((t.split("\n")[1] || "").trim().replace(/\s+/g, " "));
  return { drive: product || "Optical drive", media: /no media/i.test(type) ? null : type || null, device: dev, bytes: blocks * 2048 };
}

export async function detectDrives() {
  if (process.platform === "darwin") {
    try { const { stdout } = await run("drutil", ["status"]); const d = parseDrutil(stdout); return d ? [d] : []; } catch { return []; }
  }
  if (process.platform === "linux") {
    return fs.readdirSync("/dev").filter((f) => /^sr\d+$/.test(f)).map((f) => ({ drive: f, device: `/dev/${f}`, media: "unknown", bytes: 0 }));
  }
  return []; // Windows: not built - use a dedicated tool (the error says which)
}

// The commands, kept pure so they can be tested without a drive.
export function ripCommands(kind, { device, outBase, platform = process.platform }) {
  if (kind === "cd-raw") {
    const dev = platform === "darwin" ? "IODVDServices" : device;
    return [
      ...(platform === "darwin" ? [["diskutil", ["unmountDisk", device]]] : []),
      ["cdrdao", ["read-cd", "--read-raw", "--datafile", `${outBase}.bin`, "--device", dev, "--driver", "generic-mmc-raw", `${outBase}.toc`]],
      ["toc2cue", [`${outBase}.toc`, `${outBase}.cue`]],
    ];
  }
  if (kind === "dvd-iso") {
    const raw = platform === "darwin" ? device.replace("/dev/disk", "/dev/rdisk") : device;
    return [
      ...(platform === "darwin" ? [["diskutil", ["unmountDisk", device]]] : []),
      ["dd", [`if=${raw}`, `of=${outBase}.iso`, "bs=2048"], { admin: platform === "darwin" }],
    ];
  }
  throw new Error(`Can't rip a ${kind} disc.`);
}

const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
export async function rip({ consoleName, drive, outDir, name, log = () => {}, state = {} }) {
  const k = dumpKind(consoleName);
  if (k.kind === "impossible" || k.kind === "unknown") throw new Error(k.why);
  if (!drive?.device) throw new Error("No optical drive found.");
  if (process.platform === "win32") throw new Error("Ripping isn't built for Windows yet - use a dedicated tool (ImgBurn for DVDs, a Redump-style tool for CDs), then Choose… the file.");
  fs.mkdirSync(outDir, { recursive: true });
  const outBase = path.join(outDir, name.replace(/[<>:"/\\|?*]/g, ""));
  if (k.kind === "cd-raw") { try { await run("cdrdao", ["--version"]).catch((e) => { if (e.code === "ENOENT") throw e; }); } catch { throw new Error(`Ripping CDs needs cdrdao: ${process.platform === "darwin" ? "brew install cdrdao" : "sudo apt install cdrdao"}`); } }
  for (const [cmd, args, opts] of ripCommands(k.kind, { device: drive.device, outBase })) {
    if (state.cancelled) throw new Error("Cancelled.");
    log(`$ ${cmd} ${args.join(" ")}`);
    if (opts?.admin) {
      // Reading a raw disc device on macOS needs admin rights: macOS shows its own password prompt.
      const expected = drive.bytes || 0;
      const timer = expected ? setInterval(() => { try { log(`  ${Math.round((fs.statSync(`${outBase}.iso`).size / expected) * 100)}%`); } catch {} }, 5000) : null;
      try { await run("osascript", ["-e", `do shell script ${JSON.stringify(`dd ${args.map(shq).join(" ")}`)} with administrator privileges`], { maxBuffer: 1 << 20 }); }
      finally { if (timer) clearInterval(timer); }
    } else {
      await new Promise((resolve, reject) => {
        const child = spawn(cmd, args); state.child = child;
        child.stderr.on("data", (d) => log(`  ${String(d).trim().split("\n").pop()}`));
        child.on("error", reject); child.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} exited with ${c}`))));
      });
    }
  }
  return k.kind === "cd-raw" ? `${outBase}.cue` : `${outBase}.iso`;
}
