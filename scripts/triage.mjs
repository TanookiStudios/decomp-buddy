// Sorts the Discover queue with Claude Code agents instead of by hand (or the paid API).
//
//   node scripts/triage.mjs prep   [--site <TanookiStudios-Site>] [--queue <settings.json> | --repos <list.txt>] [--batch 25]
//   node scripts/triage.mjs check  <batch id>
//   node scripts/triage.mjs import [--site <TanookiStudios-Site>]
//
// prep: every repo in the app's Discover queue (settings.json "discovered") that isn't already in the
// catalog, finds.json or waiting.json gets GitHub's facts (release files, stars, description) plus the
// top of its README, and goes into a batch file ~/.decomp-buddy-triage/jobs/<batch>.md. Agents answer
// out/<batch>.json with one verdict per repo (see RULES below).
// import: "play" -> finds.json (only with a real Windows/macOS/Linux download, else it becomes "soon"),
// "soon" -> waiting.json games (Coming Soon), "hide" -> waiting.json hidden. "unsure" is left in the
// queue for Maddie. The app's next Discover scan drops everything filed, since it skips known repos.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enrichMany, publishFinds } from "../src/sources/finds.js";
import { readWaiting, excludedKeys } from "../src/waiting.js";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SITE = arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site");
const DIR = path.join(SITE, "public", "decomp-buddy");
const QUEUE = arg("--queue") || path.join(os.homedir(), "Library/Application Support/decomp-buddy/settings.json");
const WORK = path.join(os.homedir(), ".decomp-buddy-triage");
const J = (...p) => path.join(WORK, ...p);
const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const idOf = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const DESKTOP = ["Windows", "macOS", "Linux"];
export const VERDICTS = ["play", "soon", "hide", "unsure"];
const CONSOLES = ["PlayStation", "PlayStation 2", "PlayStation 3", "PlayStation 4", "PlayStation Portable", "Xbox", "Xbox 360", "Nintendo 64", "GameCube", "Wii", "Wii U",
  "Nintendo Switch", "NES", "SNES", "Game Boy", "Game Boy Color", "Game Boy Advance", "Nintendo DS", "Nintendo 3DS", "Virtual Boy", "Mega Drive", "Master System", "Sega CD", "Saturn",
  "Dreamcast", "Arcade", "IBM PC (MS-DOS)", "PC (Windows)", "Amiga", "Commodore 64", "Others"];

const RULES = `# Sorting Decomp Buddy's Discover queue

Decomp Buddy lists games people can PLAY on a computer from their own copy: decompilations, static recompilations, native PC ports and engine reimplementations. Each batch file lists repos found by automatic searches; most are noise. For EVERY repo in the batch decide one verdict:

- "play": a game you can play on Windows, macOS or Linux, AND the job's "Desktop download" line names at least one of those. Ports, recomps, decomp builds, engine reimplementations that run one specific game with the player's files, fan remakes and open-source releases of commercial games all count.
- "soon": a decompilation, recompilation or PC port of one specific game that has no Windows/macOS/Linux download yet (including matching ROM decomps that rebuild the original cartridge or disc).
- "hide": copies and copycats - forks, re-uploads, or a repo with the same name as a known project under an unrelated account (the job warns you when Decomp Buddy already lists that name), unless the README clearly says it's a distinct, maintained port with its own downloads. Also anything that looks like malware bait: a random-looking account name, a README pushing a download link, zip or archive password, "crack", "free download", or "full version". When in doubt about a copy, "hide".
- "hide" also: tools, libraries, SDKs, emulators, launchers, mod managers, mods, ROM hacks, randomizers, texture or translation patches, save editors, phone/console/VR-only ports, homework and tutorials, empty or placeholder repos, forks with no changes, awesome-lists, piracy, and repos unrelated to games (search noise).
- "unsure": only when the text really doesn't let you tell. Maddie reviews these by hand.

Also give:
- "title": the official game name (e.g. "The Legend of Zelda: Majora's Mask"). If the project has its own name, use "Game (Project)", e.g. "Heroes of Might and Magic II (fheroes2)". For hide, the repo name is fine.
- "console": the ORIGINAL platform, exactly one of: ${CONSOLES.join(", ")}.
- "reason": one short sentence saying why.

Use only what the job text says. Never guess a download exists: "play" requires the Desktop download line to name Windows, macOS or Linux.
One exception: when the release has files but their names don't say the computer (e.g. "Game-v1.0.zip"), and the README clearly says which computer that download is for, you may answer "play" with "platforms": ["Windows"] (or macOS / Linux) and "platform_quote": the README sentence that says so, copied word for word (it must name that computer).

Answer file: out/<batch id>.json, raw JSON only:
{ "results": [ { "repo": "owner/name", "verdict": "play|soon|hide|unsure", "title": "...", "console": "...", "reason": "..." }, ... one per repo in the batch ] }

Then run: node ~/Documents/GitHub/DecompBuddy/scripts/triage.mjs check <batch id>   and fix anything it reports.
`;

function known() {
  const k = new Set();
  for (const g of readJSON(path.join(DIR, "catalog.json")).games) if (g.repo) k.add(g.repo.toLowerCase());
  for (const g of readJSON(path.join(DIR, "finds.json")).games) k.add(g.repo.toLowerCase());
  for (const r of excludedKeys(readWaiting(path.join(DIR, "waiting.json")))) k.add(r);
  return k;
}

async function readme(repo) {
  for (const f of ["README.md", "readme.md", "README.MD", "Readme.md", "README"]) {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/HEAD/${f}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (r?.ok) return (await r.text()).slice(0, 2500);
  }
  return "";
}

async function prep() {
  const size = Number(arg("--batch")) || 25;
  for (const d of ["jobs", "ctx", "out", "done"]) fs.mkdirSync(J(d), { recursive: true });
  fs.writeFileSync(J("RULES.md"), RULES);
  // --repos <file>: sort a hand-picked list (one owner/repo per line, e.g. from browser tabs) instead of the app's queue.
  const list = arg("--repos");
  const have = known(), queue = list ? fs.readFileSync(list, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((repo) => ({ repo })) : Object.values(readJSON(QUEUE).discovered || {});
  const listed = new Map([...have].map((r) => [r.split("/")[1], r]));
  const todo = queue.map((c) => c.repo).filter((r) => r && !have.has(r.toLowerCase()));
  console.log(`queue ${queue.length}, already filed ${queue.length - todo.length}, to sort ${todo.length}`);
  // GitHub facts 40 repos per request (GraphQL); READMEs come from raw.githubusercontent.com, which has no quota.
  const need = todo.filter((r) => !fs.existsSync(J("ctx", `${idOf(r)}.json`)));
  let failed = 0;
  for (let b = 0; b < need.length; b += 200) {
    const infos = await enrichMany(need.slice(b, b + 200));
    const got = [...infos].filter(([, e]) => !(e instanceof Error));
    failed += infos.size - got.length;
    let i = 0;
    await Promise.all(Array.from({ length: 8 }, async () => { while (i < got.length) { const [repo, e] = got[i++];
      fs.writeFileSync(J("ctx", `${idOf(repo)}.json`), JSON.stringify({ queued: repo, ...e, readme: e.exists ? await readme(e.repo) : "" })); } }));
    if (got.length < infos.size && [...infos.values()].some((e) => /rate limit/i.test(e?.message || ""))) { console.log("GitHub rate limit - run prep again after it resets"); break; }
  }
  // Batches are rebuilt from every fetched repo not yet answered, so a re-run after a rate limit picks up the rest.
  const answered = new Set(fs.readdirSync(J("done")).flatMap((f) => readJSON(J("done", f)).results.map((r) => r.queued || r.repo).map((r) => r.toLowerCase())));
  // Renamed repos: the queue may hold the old name of something we already list, so check GitHub's current one too.
  const ready = todo.filter((r) => fs.existsSync(J("ctx", `${idOf(r)}.json`)) && !answered.has(r.toLowerCase()) && !have.has(String(readJSON(J("ctx", `${idOf(r)}.json`)).repo).toLowerCase()));
  for (const f of fs.readdirSync(J("jobs"))) fs.rmSync(J("jobs", f));
  let n = 0;
  for (let b = 0; b < ready.length; b += size) {
    const id = `t${String(++n).padStart(3, "0")}`;
    const body = ready.slice(b, b + size).map((r, k) => {
      const c = readJSON(J("ctx", `${idOf(r)}.json`));
      if (!c.exists) return `=== REPO ${k + 1}: ${r} ===\nThe repo no longer exists.\n`;
      const desk = c.platforms.filter((p) => DESKTOP.includes(p));
      const twin = listed.get(c.repo.split("/")[1].toLowerCase());
      return [`=== REPO ${k + 1}: ${c.repo} ===`, `Description: ${c.notes || "(none)"}`, `Stars: ${c.stars} · Fork: ${c.fork ? "yes" : "no"} · Last update: ${c.updatedAt || "?"} · Website: ${c.website || "-"}`,
        ...(twin ? [`WARNING: Decomp Buddy already lists a project with this exact name: ${twin}. A same-named repo under another account is usually a fork or a copycat.`] : []),
        `Desktop download: ${desk.length ? desk.join(", ") : "none"}${c.platforms.length > desk.length ? ` (also: ${c.platforms.filter((p) => !DESKTOP.includes(p)).join(", ")})` : ""}`,
        `Release files: ${c.releases.map((x) => `${x.tag}: ${x.files.join(", ") || "(no files)"}`).join(" | ") || "no releases"}`,
        "README (start):", "```", c.readme.replace(/```/g, "'''") || "(no README)", "```", ""].join("\n");
    }).join("\n");
    fs.writeFileSync(J("jobs", `${id}.repos.json`), JSON.stringify(ready.slice(b, b + size).map((r) => readJSON(J("ctx", `${idOf(r)}.json`)).repo || r)));
    fs.writeFileSync(J("jobs", `${id}.md`), `Batch id: ${id} · Answer file: ${J("out", `${id}.json`)}\nRead ${J("RULES.md")} first.\n\n${body}`);
  }
  console.log(`prep: ${ready.length} repo(s) in ${n} batch(es) of ${size} -> ${J("jobs")}${failed ? ` (${failed} not fetched yet)` : ""}`);
}

// The batch's repos live in their own file: README text inside the job can look like anything.
const batchRepos = (id) => readJSON(J("jobs", `${id}.repos.json`));

// Which computers a "play" answer installs on: what the release file names say, or - when the files don't
// name one (e.g. "Game-v1.0.zip") - the agent's "platforms", backed by a README sentence copied word for word.
export function desktopOf(r, c) {
  const named = (c?.platforms || []).filter((p) => DESKTOP.includes(p));
  if (named.length) return named;
  const hasFiles = (c?.releases || []).some((x) => x.files.length), q = String(r.platform_quote || "").trim();
  if (!hasFiles || q.length < 8 || !String(c?.readme || "").includes(q)) return [];
  const said = { Windows: /windows/i, macOS: /mac ?os|macintosh|\bmac\b/i, Linux: /linux/i };
  return (Array.isArray(r.platforms) ? r.platforms : []).filter((p) => DESKTOP.includes(p) && said[p].test(q));
}

// The same checks import makes; agents run it on their own answer.
export function problems(answer, repos, ctxOf) {
  const out = [], got = new Map();
  for (const r of answer?.results || []) {
    if (!VERDICTS.includes(r.verdict)) out.push(`${r.repo}: verdict must be one of ${VERDICTS.join("/")}`);
    if (r.verdict !== "hide" && !CONSOLES.includes(r.console)) out.push(`${r.repo}: console "${r.console}" isn't in the list`);
    if (!String(r.title || "").trim()) out.push(`${r.repo}: title is empty`);
    if (r.verdict === "play" && !desktopOf(r, ctxOf(r.repo)).length) out.push(`${r.repo}: "play" needs a Windows/macOS/Linux download: the job lists none, and no "platforms" + verbatim "platform_quote" from the README backs one - use "soon" or "unsure"`);
    got.set(String(r.repo).toLowerCase(), r);
  }
  for (const r of repos) if (!got.has(r.toLowerCase())) out.push(`${r}: missing from results`);
  for (const k of got.keys()) if (!repos.some((r) => r.toLowerCase() === k)) out.push(`${k}: not in this batch`);
  return out;
}
const ctxByRepo = () => { const m = new Map(); for (const f of fs.readdirSync(J("ctx"))) { const c = readJSON(J("ctx", f)); m.set(String(c.repo || c.queued).toLowerCase(), c); m.set(c.queued.toLowerCase(), c); } return (r) => m.get(String(r).toLowerCase()); };

function check(id) {
  const f = J("out", `${id}.json`);
  if (!fs.existsSync(f)) { console.log(`no answer file ${f}`); process.exit(1); }
  let a; try { a = readJSON(f); } catch (err) { console.log(`not valid JSON: ${err.message}`); process.exit(1); }
  const p = problems(a, batchRepos(id), ctxByRepo());
  console.log(p.length ? p.join("\n") : `${id}: ok (${a.results.length} repos)`);
  process.exit(p.length ? 1 : 0);
}

function importAnswers() {
  const ctxOf = ctxByRepo(), now = new Date().toISOString(), via = "Discover queue (sorted by Claude Code)";
  const have = known(), finds = [], soon = [], hide = [], unsure = [], rejected = [];
  for (const f of fs.readdirSync(J("out")).filter((x) => x.endsWith(".json"))) {
    const id = f.replace(/\.json$/, ""); let a;
    try { a = readJSON(J("out", f)); } catch { rejected.push(id); continue; }
    if (problems(a, batchRepos(id), ctxOf).length) { rejected.push(id); continue; }
    for (const r of a.results) {
      const c = ctxOf(r.repo), repo = c?.repo || r.repo;
      if (have.has(repo.toLowerCase())) continue; have.add(repo.toLowerCase());
      if (r.verdict === "play") finds.push({ repo, title: r.title, console: r.console, platforms: desktopOf(r, c), version: c.version, status: c.status, updatedAt: c.updatedAt, notes: c.notes || "", website: c.website || "", addedAt: now, via });
      else if (r.verdict === "soon") soon.push({ repo, title: r.title, console: r.console, notes: c?.notes || "", website: c?.website || "", addedAt: now, via });
      else if (r.verdict === "hide") hide.push({ repo, title: r.title, reason: r.reason });
      else unsure.push({ repo, title: r.title, reason: r.reason });
    }
    fs.renameSync(J("out", f), J("done", f));
  }
  if (finds.length) publishFinds(path.join(DIR, "finds.json"), finds);
  const wf = path.join(DIR, "waiting.json"), w = readJSON(wf);
  w.games.push(...soon); w.hidden.push(...hide);
  w.games.sort((a, b) => a.title.localeCompare(b.title)); w.updatedAt = now;
  fs.writeFileSync(`${wf}.tmp`, JSON.stringify(w, null, 2) + "\n"); fs.renameSync(`${wf}.tmp`, wf);
  fs.appendFileSync(J("unsure.jsonl"), unsure.map((u) => JSON.stringify(u) + "\n").join(""));
  console.log(`import: ${finds.length} playable, ${soon.length} Coming Soon, ${hide.length} hidden, ${unsure.length} unsure (left in the queue; listed in ${J("unsure.jsonl")})${rejected.length ? `; rejected batch(es): ${rejected.join(", ")}` : ""}`);
  for (const g of finds) console.log(`  + ${g.title} [${g.console}] ${g.repo}`);
}

const cmd = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === "prep") await prep(); else if (cmd === "check") check(process.argv[3]); else if (cmd === "import") importAnswers();
  else { console.log("usage: triage.mjs prep|check <batch>|import"); process.exit(1); }
}
