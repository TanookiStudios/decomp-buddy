// Apple Intelligence (Foundation Models) as a free, on-device planner for repos without a published plan.
// The model is small (4,096 tokens for question + answer), so it gets a short brief - the repo, its release
// files and the start of the README - and answers a handful of fields. Everything else in the plan is filled
// with conservative defaults, and the answer is checked against the real release list before it's used.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Analysis } from "./plan.js";
import { targetOf } from "./targets.js";

// Bundled in the Mac app's Resources; in development, scripts/build-apple-ai.sh builds it into build/.
export function helperPath() {
  const candidates = [process.resourcesPath && path.join(process.resourcesPath, "apple-ai", "decomp-buddy-ai"), path.join(import.meta.dirname, "..", "build", "apple-ai", "decomp-buddy-ai")].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

const run = (args, input, { timeout = 120_000, bin = helperPath() } = {}) => new Promise((resolve, reject) => {
  if (!bin) return reject(Object.assign(new Error("Apple Intelligence helper isn't installed."), { code: 2 }));
  const child = execFile(bin, args, { timeout, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
    if (err) return reject(Object.assign(new Error(String(stderr || err.message).trim()), { code: err.code }));
    resolve(stdout);
  });
  if (input != null) child.stdin.end(input);
});

// { available, reason? } - false off macOS, on Intel Macs, before macOS 26, or with Apple Intelligence off.
export async function status({ bin } = {}) {
  if (process.platform !== "darwin") return { available: false, reason: "Apple Intelligence is only on Macs." };
  try { return JSON.parse(await run(["--status"], null, { timeout: 15_000, bin })); }
  catch (err) { return { available: false, reason: /Bad CPU|cannot execute|Library not loaded|Symbol not found/i.test(err.message) ? "This Mac needs Apple silicon and macOS 26 or later." : err.message }; }
}

const SYSTEM = `You write install steps for one game port as JSON. Use only facts from the text. Reply with JSON only:
{"game_title": "...", "console": "...", "release_asset": "...", "executable": "...", "game_file_formats": ["..."], "first_run": ["..."]}
- release_asset: copy one file name exactly from the release list, the one for the target computer.
- executable: just the program's file name (like Game.exe), the one the player runs after unzipping, no folders.
- game_file_formats: the file extensions of the player's own game copy that the README asks for (for example a ROM or disc image). Use [] if the README doesn't say.
- If unsure of a field, use null.`;

// shortcut: README cut to the first ~6,000 characters (the model's 4,096-token window holds about that much
// alongside the rest); a README whose install steps come later gets a rougher plan, or "too long" and a retry shorter.
export function brief(ctx, { target = "windows", readmeChars = 6000 } = {}) {
  const rel = (ctx.releases || []).slice(0, 3).map((r) => `${r.tag}: ${(r.assets || []).map((a) => a.name).join(", ") || "(no files)"}`).join("\n");
  return `Repository: ${ctx.fullName}\nDescription: ${ctx.description || ""}\nReleases (newest first):\n${rel || "(none)"}\n\nREADME:\n${String(ctx.readme || "").slice(0, readmeChars)}\n\nTarget computer: ${targetOf(target).prompt}.`;
}

const extractJson = (text) => { const s = String(text); return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); };

// Apple's short answer -> a full Analysis the rest of the app understands. The download must really exist.
export function toAnalysis(answer, ctx) {
  const all = (ctx.releases || []).flatMap((r) => (r.assets || []).map((a) => ({ tag: r.tag, name: a.name })));
  const want = String(answer.release_asset || "").trim().toLowerCase();
  const hit = want && all.find((a) => a.name.toLowerCase() === want);
  const exe = answer.executable ? path.basename(String(answer.executable).replace(/\\/g, "/")) : null;
  // ".z64" or "z64" is an extension; a bare capitalized word ("ROM", "Disc image") is a description, not a format.
  const formats = (Array.isArray(answer.game_file_formats) ? answer.game_file_formats : []).map((f) => String(f).trim())
    .filter((f) => f.startsWith(".") || !/[A-Z\s]/.test(f)).map((f) => (f.startsWith(".") ? f : `.${f}`).toLowerCase()).filter((f) => /^\.[a-z0-9]{1,5}$/.test(f));
  const title = String(answer.game_title || ctx.fullName.split("/")[1]).trim();
  const plan = {
    game_title: title, console: String(answer.console || "Unknown").trim(),
    build: { method: hit ? "release" : "unsupported", release_asset: hit?.name || null, release_tag: hit?.tag || null, build_steps: [], required_tools: [], executable: exe },
    game_files: [{ label: `${title} game file`, description: "Your own copy of the game, as the project's README describes.", accepted_formats: formats, expected_filename: null, how_provided: "in_app_picker", drop_into: "Game Files", notes: null, kind: "game", expected_region: "unknown", required_version: null, expected_hashes: [], expected_size: null, expected_serial: null }],
    first_run: (Array.isArray(answer.first_run) ? answer.first_run : []).map(String).filter(Boolean).slice(0, 8),
    notes: ["These steps were written on this Mac by Apple's on-device model from the start of the project's README. If something doesn't match, check the project page."],
    confidence: "low", unsure: hit ? [] : [`Apple's model named a download that isn't in the releases (${answer.release_asset || "none"}).`],
    artwork_url: null, mods_method: "none", mods_folder: null, mods_formats: [], mods_notes: "",
  };
  return Analysis.parse({ redirect_repo: null, games: [plan] });
}

export async function planViaApple(ctx, { target = "windows", log = () => {}, bin } = {}) {
  log("Asking Apple Intelligence on this Mac to read the repo (free, on-device)…");
  let text;
  try { text = await run([SYSTEM], brief(ctx, { target }), { bin }); }
  catch (err) {
    if (err.code !== 3) throw err;
    log("  The README is long for Apple's model - trying again with less of it.");
    text = await run([SYSTEM], brief(ctx, { target, readmeChars: 2500 }), { bin });
  }
  let answer;
  try { answer = extractJson(text); } catch { throw new Error("Apple's model didn't answer in the expected format."); }
  const analysis = toAnalysis(answer, ctx);
  if (analysis.games[0].build.method !== "release") throw new Error(`Apple's model couldn't find a ${targetOf(target).label} download in this repo's releases.`);
  return analysis;
}
