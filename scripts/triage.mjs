// Sorts the Discover queue with Claude Code agents instead of by hand (or the paid API).
//
//   node scripts/triage.mjs prep   [--site <TanookiStudios-Site>] [--queue <settings.json> | --repos <list.txt>] [--no-reddit] [--scan] [--batch 25]
//   (--repos lines: owner/repo, a github.com link, a gitlab.com link, or a codeberg.org link)
//   node scripts/triage.mjs check  <batch id>
//   node scripts/triage.mjs import [--site <TanookiStudios-Site>]
//   node scripts/triage.mjs suggestions   players' pending suggestions: closes the filed ones, lists the rest
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
import { execFileSync } from "node:child_process";
import { enrichMany, enrichFromGitLab, enrichFromForgejo, publishFinds } from "../src/sources/finds.js";
import { FORGEJO, forgejoOf, anyRefFromUrl } from "../src/forges.js";
import { readWaiting, excludedKeys } from "../src/waiting.js";
import { CONSOLES as CONSOLE_TARGETS, CONSOLE_PLATFORMS } from "../src/targets.js";
import { CONSOLE_NAMES as CONSOLES } from "../src/renames.js";
import { scanReddit, scanBluesky, scanGitHub, scanGitHubTopics, scanRecompHaven, scanUnbaked, scanAwesomeLists, scanRecompFyi } from "../src/discover.js";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SITE = arg("--site") || path.join(os.homedir(), "Documents/GitHub/TanookiStudios-Site");
const DIR = path.join(SITE, "public", "decomp-buddy");
const QUEUE = arg("--queue") || path.join(os.homedir(), "Library/Application Support/decomp-buddy/settings.json");
const WORK = path.join(os.homedir(), ".decomp-buddy-triage");
const J = (...p) => path.join(WORK, ...p);
const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const idOf = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, "_");
// Where Decomp Buddy can install a game: computers, plus Android phones/handhelds and Meta Quest headsets (over USB),
// plus consoles running homebrew (downloaded and unpacked for you to copy over - src/targets.js CONSOLES).
const DESKTOP = ["Windows", "macOS", "Linux", "Android", "Meta Quest"];
const PLAYABLE = [...DESKTOP, ...CONSOLE_PLATFORMS];
const SAID = { Windows: /windows/i, macOS: /mac ?os|macintosh|\bmac\b/i, Linux: /linux/i, Android: /android/i, "Meta Quest": /quest|oculus/i,
  ...Object.fromEntries(Object.values(CONSOLE_TARGETS).map((c) => [c.platform, new RegExp(`${c.name.source}|${c.label.replace(/[^A-Za-z0-9 ]/g, ".")}`, "i")])) };
export const VERDICTS = ["play", "soon", "hide", "unsure"];

const RULES = `# Sorting Decomp Buddy's Discover queue

Decomp Buddy lists games people can PLAY from their own copy - on a computer, an Android phone or handheld, a Meta Quest headset, or a console running homebrew (${CONSOLE_PLATFORMS.join(", ")}): decompilations, static recompilations, native ports, engine reimplementations, and emulators built to run on a console. Each batch file lists repos found by automatic searches; most are noise. For EVERY repo in the batch decide one verdict:

- "play": a game you can play on one of those, AND the job's "Download" line names at least one of them (an .apk counts for Android / Meta Quest). Ports, recomps, decomp builds, engine reimplementations that run one specific game with the player's files, fan remakes, open-source releases of commercial games, homebrew ports of a game to a console (e.g. Balatro on a modded Xbox 360), emulators built to run ON a console (e.g. SwanStation for Xbox 360) and single-game emulation wrappers (one game packaged with its own emulator) all count.
- "soon": a decompilation, recompilation or port of one specific game that has no download for any of those yet (including matching ROM decomps that rebuild the original cartridge or disc).
- "hide": copies and copycats - forks, re-uploads, or a repo with the same name as a known project under an unrelated account (the job warns you when Decomp Buddy already lists that name), unless the README clearly says it's a distinct, maintained port with its own downloads. Also anything that looks like malware bait: a random-looking account name, a README pushing a download link, zip or archive password, "crack", "free download", or "full version". When in doubt about a copy, "hide".
- "hide" also: tools, libraries, SDKs, general emulators for computers or phones (RetroArch, Dolphin, PCSX2, DuckStation and the like - not one game, and not built for a console), launchers, mod managers, mods, ROM hacks, randomizers, texture or translation patches, save editors, ports that only run on another VR headset (PSVR...) or a console not in the list above, homework and tutorials, empty or placeholder repos, forks with no changes, awesome-lists, piracy, and repos unrelated to games (search noise).
- Never judge a project by how old its GitHub account or organization is, or by its star count alone: a new account is not a reason to hide, hold or doubt anything. Maddie's own account is new.
- AI-made projects are judged exactly like any other: never hide, doubt or mark a project "unsure" because AI wrote some or all of it (that only becomes a neutral label later).
- "unsure": only when the text really doesn't let you tell. Maddie reviews these by hand.

Also give:
- "title": the official game name (e.g. "The Legend of Zelda: Majora's Mask"). If the project has its own name, use "Game (Project)", e.g. "Heroes of Might and Magic II (fheroes2)". For hide, the repo name is fine.
- "console": the ORIGINAL platform, exactly one of: ${CONSOLES.join(", ")}.
- "reason": one short sentence saying why.

Our own test: TanookiStudios/decomp-buddy-pipeline-test is Tanooki Test Run, Decomp Buddy's pipeline test game. When it has a desktop download it is always "play" (title "Tanooki Test Run", console "PC (Windows)").

Use only what the job text says. Never guess a download exists: "play" requires the Download line to name one of those platforms.
One exception: when the release has files but their names don't say the computer (e.g. "Game-v1.0.zip"), and the README clearly says which computer that download is for, you may answer "play" with "platforms": ["Windows"] (or macOS / Linux) and "platform_quote": the README sentence that says so, copied word for word (it must name that computer).
Consoles: a file NAME that mentions a console proves nothing by itself - PC recomps of Xbox 360 or PSP games name the original console all the time ("Spider-Man.3.Xbox.360.Recomp.zip" is a Windows download). The job lists those under "File names also mention". Add such a console to "platforms" (e.g. ["Xbox 360"], beside any computer ones) only when the README says that download runs ON that console, with "platform_quote": that README sentence copied word for word. Use the platform names exactly as listed above.

Answer file: out/<batch id>.json, raw JSON only:
{ "results": [ { "repo": "owner/name", "verdict": "play|soon|hide|unsure", "title": "...", "console": "...", "reason": "...", "platforms": [...] and "platform_quote": "..." only when a rule above asks for them }, ... one per repo in the batch ] }

Then run: node ~/Documents/GitHub/DecompBuddy/scripts/triage.mjs check <batch id>   and fix anything it reports.
`;

// GitLab and Codeberg projects travel through the sorter as "gitlab:owner/repo" / "codeberg:owner/repo"; GitHub ones stay plain "owner/repo".
// Their playable finds go into their own list file on the site (a shared "list" source), not finds.json.
const FORGES = {
  gitlab: { site: "https://gitlab.com", raw: (key, f) => `https://gitlab.com/${key}/-/raw/HEAD/${f}`, enrich: enrichFromGitLab, list: "gitlab.json", label: "GitLab" },
  // Codeberg and every other Forgejo/Gitea site in src/forges.js.
  ...Object.fromEntries(Object.entries(FORGEJO).map(([id, f]) => [id, forgejoForge(id, f)])),
};
function forgejoForge(id, f) {
  return { site: `https://${f.domain}`, raw: (key, file) => `https://${f.domain}/${key}/raw/HEAD/${file}`, enrich: (key) => enrichFromForgejo(f.domain, key), list: `${id}.json`, label: f.label };
}
// A Forgejo/Gitea site that isn't in the table is known by its address ("git.example.org:owner/repo").
const forge = (host) => FORGES[host] || (forgejoOf(host) ? forgejoForge(host, forgejoOf(host)) : null);
const forgeOf = (r) => { const s = String(r), h = s.slice(0, s.indexOf(":")); return s.includes(":") && forge(h) ? h : null; };
// Every forge list file the site serves: the table's, plus any site known by address that sources.json names.
const forgeLists = () => { const own = "https://tanookistudios.com/decomp-buddy/"; let named = []; try { named = readJSON(path.join(DIR, "sources.json")).sources.filter((x) => x.type === "list" && x.value.startsWith(own)).map((x) => x.value.slice(own.length)); } catch {} return [...new Set([...Object.values(FORGES).map((f) => f.list), ...named])]; };
export const queueKey = (s) => { const r = anyRefFromUrl(s); return r && r.host !== "github" ? `${r.host}:${r.owner}/${r.repo}` : String(s).replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, ""); };
function known() {
  const k = new Set();
  for (const g of readJSON(path.join(DIR, "catalog.json")).games) if (g.repo) k.add((forge(g.host) ? `${g.host}:${g.repo}` : g.repo).toLowerCase());
  for (const g of readJSON(path.join(DIR, "finds.json")).games) k.add(g.repo.toLowerCase());
  for (const f of forgeLists()) try { for (const g of readJSON(path.join(DIR, f)).games) k.add(queueKey(g.repoUrl).toLowerCase()); } catch {}
  const w = readWaiting(path.join(DIR, "waiting.json"));
  for (const r of excludedKeys(w)) k.add(r);
  for (const g of [...w.games, ...w.hidden]) if (forge(g.host)) k.add(`${g.host}:${g.repo}`.toLowerCase());
  return k;
}

// A Reddit post with no link: search GitHub for its title. GitHub's search allows 30 a minute, so 2.5s apart.
// shortcut: the 40 newest titles per run; each run only sees Reddit's newest 100 posts anyway.
const STOP = /\b(the|a|an|is|are|of|on|for|and|to|in|with|my|i|now|out|finally|here|new|release|released|wip|native|pc|port|ported|recomp|recompiled|recompilation|decomp|decompilation|static|running|runs|game|v?\d+(\.\d+)+)\b/gi;
export const titleQuery = (t) => t.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/[^A-Za-z0-9' ]+/g, " ").replace(STOP, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 5).join(" ");
async function titleLeads(posts) {
  const out = [], seen = new Set(), since = Date.now() - 180 * 86400e3;
  for (const p of posts.slice(0, 40)) {
    const q = titleQuery(p.title); if (q.length < 3 || seen.has(q.toLowerCase())) continue; seen.add(q.toLowerCase());
    const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=updated&per_page=5`, { headers: { "User-Agent": "decomp-buddy", Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } }).catch(() => null);
    if (res?.ok) for (const r of ((await res.json()).items || []).filter((r) => Date.parse(r.pushed_at) > since && /recomp|decomp|port|native|pc/i.test(`${r.name} ${r.description || ""}`)).slice(0, 3)) out.push({ repo: r.full_name, title: p.title, via: `r/${p.sub} (title search)` });
    await new Promise((r) => setTimeout(r, 2500));
  }
  return out;
}

async function readme(repo) {
  const fo = forge(forgeOf(repo)), key = fo ? repo.slice(repo.indexOf(":") + 1) : repo;
  for (const name of ["README.md", "readme.md", "README.MD", "Readme.md", "README"]) {
    const r = await fetch(fo ? fo.raw(key, name) : `https://raw.githubusercontent.com/${key}/HEAD/${name}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (r?.ok) return (await r.text()).slice(0, 2500);
  }
  return "";
}

// Games players suggested (decompbuddy.com/add-game and the app's Suggest A Decomp), read straight from the site's
// database with the deploy login. A suggestion stays "pending" until it's filed, then it's marked "have" - so one
// that fails to sort today is fetched again tomorrow instead of being dropped.
const d1 = (sql) => JSON.parse(execFileSync("npx", ["--yes", "wrangler", "d1", "execute", "tanooki-site", "--remote", "--json", "--command", sql],
  { cwd: SITE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }))[0].results;
const d1File = (sql) => { const f = J("d1.sql"); fs.writeFileSync(f, sql);
  execFileSync("npx", ["--yes", "wrangler", "d1", "execute", "tanooki-site", "--remote", "--file", f], { cwd: SITE, stdio: ["ignore", "pipe", "pipe"] }); };
const sq = (v) => v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
// Repos already sorted (an answer file in done/), and the "unsure" ones waiting for Maddie (unsure.jsonl).
// decided: only play/soon/hide answers - an "unsure" answer is still waiting for a decision.
const answeredRepos = (decided = false) => new Set(fs.readdirSync(J("done")).flatMap((f) => readJSON(J("done", f)).results.filter((r) => !decided || r.verdict !== "unsure").map((r) => r.queued || r.repo).map((r) => r.toLowerCase())));
const askedRepos = () => new Set(fs.existsSync(J("unsure.jsonl")) ? fs.readFileSync(J("unsure.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).repo.toLowerCase()) : []);
function suggestions(have) {
  const rows = d1("SELECT id, repo_url FROM decomp_suggestions WHERE status = 'pending' ORDER BY created_at, id").map((r) => ({ id: Number(r.id), repo: queueKey(r.repo_url) }));
  const close = (list, status) => { const ids = list.map((r) => r.id).filter(Number.isInteger); if (ids.length) d1(`UPDATE decomp_suggestions SET status = '${status}', updated_at = datetime('now') WHERE id IN (${ids.join(",")})`); return ids.length; };
  const answered = answeredRepos(true), asked = askedRepos();
  // Listed under a new name counts as filed (a renamed repo's suggestion otherwise stayed pending forever: 44 did, 12-21 Nov).
  const isHave = (r) => have.has(r.repo.toLowerCase()) || have.has(String(ctxOfRepo(r.repo)?.repo || "").toLowerCase()), key = (r) => r.repo.toLowerCase();
  const filed = close(rows.filter(isHave), "have");
  // Sorted but not listed (not a game, gone, a copy): closed, or the same rows would fill every hour's batch forever (17 Nov 2026: 148 of 150 were).
  const turned = close(rows.filter((r) => !isHave(r) && answered.has(key(r))), "rejected");
  // Unsure ones stay pending (Maddie's admin queue shows them) but don't take a slot; they wait for her.
  const todo = rows.filter((r) => !isHave(r) && !answered.has(key(r)) && !asked.has(key(r)));
  // Oldest first (created_at: one Maddie moves to the front gets an early date), 300 a run (raised from 150 on 17 Nov 2026 to clear the backlog): a big batch spreads over a few hourly runs instead of one huge one.
  console.log(`player suggestions: ${rows.length} pending, ${filed} already filed and closed, ${turned} sorted earlier and closed, ${rows.length - filed - turned - todo.length} waiting for Maddie, ${Math.min(todo.length, 300)} sorted this run${todo.length > 300 ? `, ${todo.length - 300} wait for the next` : ""}`);
  return todo.slice(0, 300);
}

// Remove / Restore from the admin page (tanookistudios.com/admin/decomp-buddy). A removed game goes on the hidden list,
// which keeps it out of the catalog, the app and Coming Soon; a Coming Soon entry is kept inside it so Restore can
// put it back. Each action is stamped done once applied.
export function applyAdminActions(w, rows) {
  const same = (key) => (g) => `${g.host || "github"}:${g.repo}`.toLowerCase() === key;
  for (const a of rows.filter((x) => x.action === "remove" || x.action === "restore")) {
    const is = same(a.repo_key), [host, repo] = a.repo_key.split(":");
    const removed = w.hidden.find((g) => is(g) && /^removed by maddie/i.test(g.reason || ""));
    w.hidden = w.hidden.filter((g) => g !== removed);
    if (a.action === "restore") { if (removed?.was) w.games.push(removed.was); continue; }
    const was = w.games.find(is);
    w.games = w.games.filter((g) => !is(g));
    w.hidden.push({ repo, ...(host !== "github" ? { host } : {}), title: a.title || repo, reason: "Removed by Maddie", ...(was ? { was } : {}) });
  }
  return w;
}
// The queue buttons (21 Nov 2026): Approve, Full Approval and Reject. Maddie's decision beats the robot's, whatever
// it said before (unsure, hidden, or not sorted yet).
const aKey = (r) => (forgeOf(r) ? r : `github:${r}`).toLowerCase(); // sorter key -> the admin page's key
const qKey = (k) => (k.startsWith("github:") ? k.slice(7) : k); // the admin page's key -> sorter key
const urlOf = (r) => { const h = forgeOf(r); return h ? `${forge(h).site}/${r.slice(h.length + 1)}` : `https://github.com/${r}`; };
const ctxOfRepo = (r) => { const f = J("ctx", `${idOf(r)}.json`); return fs.existsSync(f) ? readJSON(f) : null; };
async function ctxFor(r) {
  const have = ctxOfRepo(r); if (have) return have;
  const host = forgeOf(r);
  try {
    const e = host ? await forge(host).enrich(r.slice(host.length + 1)) : [...(await enrichMany([r])).values()][0];
    if (!e || e instanceof Error) return null;
    const c = { queued: r, ...e, ...(host ? { host, repo: `${host}:${e.repo}` } : {}) };
    c.readme = e.exists ? await readme(c.repo) : "";
    fs.writeFileSync(J("ctx", `${idOf(r)}.json`), JSON.stringify(c)); return c;
  } catch { return null; }
}
// The robot's newest answer per repo (its title and console guess), oldest answer files first.
function answersByRepo() {
  const m = new Map();
  for (const f of fs.readdirSync(J("done")).map((f) => [f, fs.statSync(J("done", f)).mtimeMs]).sort((a, b) => a[1] - b[1]))
    for (const x of readJSON(J("done", f[0])).results) { const k = String(x.queued || x.repo).toLowerCase(); m.set(k, { ...x, at: f[1] }); const c = ctxOfRepo(k); if (c?.repo) m.set(String(c.repo).toLowerCase(), { ...x, at: f[1] }); }
  return m;
}
// What the author is told when Maddie rejects with "tell the author" ticked (the site emails the same words).
export const authorNote = (repo, reason) => `Hi! Decomp Buddy is a free launcher that lists decomps, recomps and PC ports so people can find and play them.

We looked at ${repo} and decided not to list it for now.

Reason: ${reason || "it isn't a fit for the catalog right now."}

If we got that wrong, or things change later, just reply here or email hello@decompbuddy.com and we'll take another look. Thanks for making cool stuff!

- Decomp Buddy`;
function tellAuthor(repo, reason) {
  if (forgeOf(repo)) return "The author couldn't be reached: no public email, and the project isn't on GitHub.";
  try {
    execFileSync("gh", ["issue", "create", "-R", repo, "--title", "About listing this project in Decomp Buddy", "--body", authorNote(repo, reason)], { stdio: ["ignore", "pipe", "pipe"] });
    return "A note was left on the project's GitHub page.";
  } catch (e) { return `The author couldn't be reached (${/disabled|not enabled/i.test(String(e.stderr)) ? "issues are turned off on that project" : "GitHub refused the note"}).`; }
}
// Full Approval: listed once its install steps exist, without waiting for the malware scan. The scan still runs
// straight after, and a flagged file takes the game back out (src/publiccatalog.js, Maddie's call 21 Nov 2026).
function fastTrack(repo) {
  const f = path.join(DIR, "fast-track.json"); let m = {}; try { m = readJSON(f); } catch {}
  m[aKey(repo)] = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(f, JSON.stringify(m, null, 2) + "\n");
}
async function adminActions() {
  const rows = d1("SELECT id, action, repo_key, title, reason, notify FROM decomp_admin_actions WHERE done_at IS NULL ORDER BY id");
  if (!rows.length) return 0;
  const wf = path.join(DIR, "waiting.json");
  if (rows.some((a) => a.action === "remove" || a.action === "restore")) fs.writeFileSync(wf, JSON.stringify(applyAdminActions(readJSON(wf), rows), null, 2) + "\n");
  const answers = answersByRepo(), now = new Date().toISOString(), via = "Approved by Maddie";
  for (const a of rows.filter((x) => x.action !== "remove" && x.action !== "restore")) {
    const r = qKey(String(a.repo_key)), c = await ctxFor(r), robot = answers.get(r.toLowerCase()) || {};
    const repo = c?.repo || r, title = a.title || robot.title || repo.split("/").pop(), con = robot.console || "Unknown";
    if (a.action === "approve" || a.action === "approve_full") {
      if (!c?.exists) { a.result = "The project couldn't be read (deleted or private), so nothing was added."; continue; }
      fs.appendFileSync(J("maddie-approves.jsonl"), JSON.stringify({ repo, title, at: now }) + "\n");
      if (!(c.releases || []).some((x) => x.files.length)) {
        fileDecisions({ soon: [{ repo, title, console: con, notes: c.notes || "", website: c.website || "", addedAt: now, via }] }, new Set([r.toLowerCase()]));
        a.result = "Approved, but it has no download yet, so it's in Coming Soon until it does."; continue;
      }
      fileDecisions({ finds: [{ repo, title, console: con, platforms: (c.platforms || []).filter((p) => PLAYABLE.includes(p)), version: c.version, status: c.status, updatedAt: c.updatedAt, notes: c.notes || "", website: c.website || "", addedAt: now, via }] }, new Set([r.toLowerCase()]));
      if (a.action === "approve_full") fastTrack(repo);
      a.result = a.action === "approve_full" ? "Approved: it's listed as soon as its install steps are written; the malware scan runs straight after." : "Approved: install steps, then the malware scan, then it's backed up and listed.";
    } else if (a.action === "reject") {
      fileDecisions({ hide: [{ repo, title, reason: `Rejected by Maddie: ${a.reason || "not a fit"}` }] }, new Set([r.toLowerCase()]));
      fs.appendFileSync(J("maddie-rejects.jsonl"), JSON.stringify({ repo, title, reason: a.reason || "", at: now }) + "\n");
      a.result = `Rejected.${a.notify === "issue" ? ` ${tellAuthor(repo, a.reason)}` : a.notify === "emailed" ? " The author was emailed." : a.notify === "unreachable" ? " The author couldn't be reached." : ""}`;
    } else a.result = `"${a.action}" isn't something this script knows, so nothing was done.`;
  }
  d1File(rows.map((a) => `UPDATE decomp_admin_actions SET done_at = datetime('now'), result = ${sq(a.result || "Done.")} WHERE id = ${Number(a.id)};`).join("\n"));
  console.log(`admin actions: ${rows.map((r) => `${r.action} ${r.title || r.repo_key}`).join(", ")}`);
  return rows.length;
}

// Teaching the robot: Maddie's own decisions go at the end of the sorting rules, so the same kind of repo gets the same answer.
const lines = (f) => (fs.existsSync(J(f)) ? fs.readFileSync(J(f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
function maddieRules() {
  const no = lines("maddie-rejects.jsonl").slice(-60), yes = lines("maddie-approves.jsonl").slice(-40);
  return (no.length ? `\n## Maddie turned these down by hand\nAnswer "hide" for anything like them, for the same reason:\n${no.map((x) => `- ${x.repo}: ${x.reason || "not a fit"}`).join("\n")}\n` : "")
    + (yes.length ? `\n## Maddie approved these by hand\nThey are the kind of project she wants listed; don't answer "unsure" for ones like them:\n${yes.map((x) => `- ${x.repo} (${x.title})`).join("\n")}\n` : "");
}

// The admin page's queue (D1 decomp_queue): what waits for Maddie, what the robot sorts this hour, and what it hid in
// the last 7 days (so she can overrule it). Rows that left the queue are deleted. Health: what broke this hour.
function syncQueue(sorting = [], via = new Map(), broken = null) {
  const answers = answersByRepo(), w = readWaiting(path.join(DIR, "waiting.json")), rows = new Map(), week = Date.now() - 7 * 864e5;
  const add = (r, kind, reason, title) => {
    const c = ctxOfRepo(r), a = answers.get(r.toLowerCase()), repo = c?.repo || r;
    rows.set(aKey(repo), { key: aKey(repo), url: urlOf(repo), title: title || a?.title || repo.split("/").pop(), console: a?.console || "", platforms: (c?.platforms || []).filter((p) => PLAYABLE.includes(p)).join(", "), stars: Number.isFinite(c?.stars) ? c.stars : null, kind, reason: reason || "", via: via.get(r.toLowerCase()) || "" });
  };
  const robotHid = new Set(w.hidden.filter((g) => !/^(removed|rejected) by maddie/i.test(g.reason || "")).map((g) => `${g.host || "github"}:${g.repo}`.toLowerCase()));
  for (const [k, a] of answers) if (a.verdict === "hide" && a.at > week && robotHid.has(aKey(ctxOfRepo(k)?.repo || k))) add(k, "hidden", a.reason, a.title);
  for (const r of sorting) add(r, "sorting");
  for (const u of lines("unsure.jsonl")) add(u.repo, "unsure", u.reason, u.title);
  const at = new Date().toISOString().slice(0, 19).replace("T", " ");
  const cols = "repo_key, url, title, console, platforms, stars, kind, reason, via, first_seen, updated_at";
  const sql = [...rows.values()].map((x) => `INSERT INTO decomp_queue (${cols}) VALUES (${[x.key, x.url, x.title, x.console, x.platforms, x.stars, x.kind, x.reason, x.via, at, at].map(sq).join(", ")})
    ON CONFLICT(repo_key) DO UPDATE SET url = excluded.url, title = excluded.title, console = excluded.console, platforms = excluded.platforms, stars = excluded.stars, reason = excluded.reason,
    via = CASE WHEN excluded.via <> '' THEN excluded.via ELSE decomp_queue.via END, first_seen = CASE WHEN decomp_queue.kind = excluded.kind THEN decomp_queue.first_seen ELSE excluded.first_seen END, kind = excluded.kind, updated_at = excluded.updated_at;`);
  sql.push(`DELETE FROM decomp_queue WHERE updated_at <> ${sq(at)};`);
  if (broken) sql.push("DELETE FROM decomp_health;", ...broken.map(([id, m]) => `INSERT INTO decomp_health (id, message) VALUES (${sq(id)}, ${sq(m)});`), `INSERT INTO decomp_health (id, message) VALUES ('heartbeat', 'The hourly run checked in.');`);
  d1File(sql.join("\n"));
  console.log(`admin queue: ${[...rows.values()].filter((x) => x.kind === "unsure").length} waiting for Maddie, ${sorting.length} being sorted, ${[...rows.values()].filter((x) => x.kind === "hidden").length} hidden this week${broken?.length ? `; broken: ${broken.map(([id]) => id).join(", ")}` : ""}`);
}

async function prep() {
  const size = Number(arg("--batch")) || 25;
  for (const d of ["jobs", "ctx", "out", "done"]) fs.mkdirSync(J(d), { recursive: true });
  fs.writeFileSync(J("RULES.md"), RULES + maddieRules());
  // --repos <file>: sort a hand-picked list (one owner/repo per line, e.g. from browser tabs) instead of the app's queue.
  const list = arg("--repos");
  if (!list) await adminActions(); // before known(), so a game approved or rejected on the admin page isn't sorted again
  const have = known(), queue = list ? fs.readFileSync(list, "utf8").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ repo: queueKey(l) })) : Object.values(readJSON(QUEUE).discovered || {});
  // --scan: run every Discover scanner right here (Bluesky, GitHub topics, GitHub search 3 pages deep, recomphaven.com, unbaked.games), so a full
  // scan doesn't wait for someone to press Discover in the app. Reddit is added just below.
  const scanning = arg("--scan") !== null || process.argv.includes("--scan"), broken = [];
  if (scanning) {
    for (const [name, fn] of [["Bluesky", () => scanBluesky()], ["GitHub topics", () => scanGitHubTopics({ pages: 3, log: console.log })], ["GitHub search", () => scanGitHub({ pages: 3, log: console.log })], ["recomphaven.com", () => scanRecompHaven()], ["unbaked.games", () => scanUnbaked({ cacheFile: J("unbaked-cache.json"), log: console.log })], ["awesome lists", () => scanAwesomeLists()], ["recomp.fyi", () => scanRecompFyi()], ["player suggestions", () => suggestions(have)]]) {
      try { const r = await fn(); console.log(`${name}: ${r.length} candidate(s)`); queue.push(...r); } catch (err) { console.log(`${name} failed: ${err.message}`); broken.push([name, `${name} isn't working: ${err.message}`]); }
    }
  }
  // The queue sort also reads Reddit's newest posts itself (--no-reddit skips it; a --repos list never does).
  if (!list && !process.argv.includes("--no-reddit")) {
    const r = await scanReddit();
    const leads = await titleLeads(r.unlinked);
    console.log(`reddit: ${r.length} linked repo(s), ${r.unlinked.length} post(s) without a link -> ${leads.length} GitHub match(es)${r.errors.length ? ` (${r.errors.join("; ")})` : ""}`);
    if (r.errors.length && !r.length && !r.unlinked.length) broken.push(["Reddit", `Reddit isn't answering, so no new games are found there (${r.errors.join("; ")}).`]);
    queue.push(...r, ...leads);
  }
  const listed = new Map([...have].map((r) => [r.split("/")[1], r]));
  // Several sources often find the same repo; sort it once.
  // "unsure" ones wait for Maddie (unsure.jsonl); the hourly run must not re-sort them every hour. A --repos list still can.
  const asked = list ? new Set() : askedRepos();
  const todo = [...new Map(queue.map((c) => c.repo).filter((r) => r && !have.has(r.toLowerCase()) && !asked.has(r.toLowerCase())).map((r) => [r.toLowerCase(), r])).values()];
  console.log(`queue ${queue.length}, already filed ${queue.length - todo.length}, to sort ${todo.length}`);
  // GitHub facts 40 repos per request (GraphQL); READMEs come from raw.githubusercontent.com, which has no quota.
  const need = todo.filter((r) => !fs.existsSync(J("ctx", `${idOf(r)}.json`)) && !forgeOf(r));
  let failed = 0;
  // GitLab / Codeberg: one project at a time from their public APIs (a handful per run, no key needed).
  for (const r of todo.filter((r) => forgeOf(r) && !fs.existsSync(J("ctx", `${idOf(r)}.json`)))) {
    const host = forgeOf(r);
    try { const e = await forge(host).enrich(r.slice(host.length + 1)); fs.writeFileSync(J("ctx", `${idOf(r)}.json`), JSON.stringify({ queued: r, ...e, host, repo: `${host}:${e.repo}`, readme: e.exists ? await readme(`${host}:${e.repo}`) : "" })); }
    catch { failed++; }
  }
  for (let b = 0; b < need.length; b += 200) {
    const infos = await enrichMany(need.slice(b, b + 200));
    const got = [...infos].filter(([, e]) => !(e instanceof Error));
    failed += infos.size - got.length;
    let i = 0;
    await Promise.all(Array.from({ length: 8 }, async () => { while (i < got.length) { const [repo, e] = got[i++];
      fs.writeFileSync(J("ctx", `${idOf(repo)}.json`), JSON.stringify({ queued: repo, ...e, readme: e.exists ? await readme(e.repo) : "" })); } }));
    if (got.length < infos.size && [...infos.values()].some((e) => /rate limit/i.test(e?.message || ""))) { console.log("GitHub rate limit - run prep again after it resets"); break; }
  }
  // Batches are rebuilt from every fetched repo not yet filed, so a re-run after a rate limit picks up the rest. An old
  // answer doesn't count: import files every answer, so one still here was un-filed later (12 Nov 2026: 717 console
  // ports taken off the hidden list to be sorted again sat here for 9 days because their old "hide" was counted).
  // Renamed repos: the queue may hold the old name of something we already list, so check GitHub's current one too.
  const ready = todo.filter((r) => fs.existsSync(J("ctx", `${idOf(r)}.json`)) && !have.has(String(readJSON(J("ctx", `${idOf(r)}.json`)).repo).toLowerCase()));
  // queue.json: every repo still "to sort" and why it's there, so the queue can be looked at.
  if (!list) {
    const via = new Map(queue.filter((c) => c.repo).map((c) => [c.repo.toLowerCase(), c.via || c.source || c.title || ""]));
    const state = (r) => ready.includes(r) ? "Sorting this hour" : !fs.existsSync(J("ctx", `${idOf(r)}.json`)) ? "Couldn't read it yet" : "Already listed under a new name";
    fs.writeFileSync(J("queue.json"), JSON.stringify({ at: new Date().toISOString(), items: todo.map((r) => ({ repo: r, state: state(r), via: via.get(r.toLowerCase()) || "" })) }, null, 1));
  }
  for (const f of fs.readdirSync(J("jobs"))) fs.rmSync(J("jobs", f));
  let n = 0;
  for (let b = 0; b < ready.length; b += size) {
    const id = `t${String(++n).padStart(3, "0")}`;
    const body = ready.slice(b, b + size).map((r, k) => {
      const c = readJSON(J("ctx", `${idOf(r)}.json`));
      if (!c.exists) return `=== REPO ${k + 1}: ${r} ===\nThe repo no longer exists.\n`;
      const desk = c.platforms.filter((p) => PLAYABLE.includes(p));
      const twin = listed.get(c.repo.split("/")[1].toLowerCase());
      return [`=== REPO ${k + 1}: ${c.repo} ===`, `Description: ${c.notes || "(none)"}`, `Stars: ${c.stars} · Fork: ${c.fork ? "yes" : "no"} · Last update: ${c.updatedAt || "?"} · Website: ${c.website || "-"}`,
        ...(twin ? [`WARNING: Decomp Buddy already lists a project with this exact name: ${twin}. A same-named repo under another account is usually a fork or a copycat.`] : []),
        `Download: ${desk.length ? desk.join(", ") : "none"}${c.platforms.length > desk.length ? ` (also: ${c.platforms.filter((p) => !PLAYABLE.includes(p)).join(", ")})` : ""}`,
        ...((c.consolesNamed || []).length ? [`File names also mention: ${c.consolesNamed.join(", ")} (only a hint - see the Consoles rule)`] : []),
        `Release files: ${c.releases.map((x) => `${x.tag}: ${x.files.join(", ") || "(no files)"}`).join(" | ") || "no releases"}`,
        "README (start):", "```", c.readme.replace(/```/g, "'''") || "(no README)", "```", ""].join("\n");
    }).join("\n");
    fs.writeFileSync(J("jobs", `${id}.repos.json`), JSON.stringify(ready.slice(b, b + size).map((r) => readJSON(J("ctx", `${idOf(r)}.json`)).repo || r)));
    fs.writeFileSync(J("jobs", `${id}.md`), `Batch id: ${id} · Answer file: ${J("out", `${id}.json`)}\nRead ${J("RULES.md")} first.\n\n${body}`);
  }
  console.log(`prep: ${ready.length} repo(s) in ${n} batch(es) of ${size} -> ${J("jobs")}${failed ? ` (${failed} not fetched yet)` : ""}`);
  if (!list) { try { syncQueue(ready, new Map(queue.filter((c) => c.repo).map((c) => [c.repo.toLowerCase(), c.via || c.source || ""])), scanning ? broken : null); } catch (err) { console.log(`admin queue: not updated (${err.message})`); } }
}

// The batch's repos live in their own file: README text inside the job can look like anything.
const batchRepos = (id) => readJSON(J("jobs", `${id}.repos.json`));

// Which computers a "play" answer installs on: what the release file names say, or - when the files don't
// name one (e.g. "Game-v1.0.zip") - the agent's "platforms", backed by a README sentence copied word for word.
// A console a file name only mentions counts once the README quote names it (a PC recomp's zip names the original console).
export function desktopOf(r, c) {
  const named = (c?.platforms || []).filter((p) => PLAYABLE.includes(p));
  const hasFiles = (c?.releases || []).some((x) => x.files.length), q = String(r.platform_quote || "").trim();
  const quoted = hasFiles && q.length >= 8 && String(c?.readme || "").includes(q);
  const asked = (Array.isArray(r.platforms) ? r.platforms : []).filter((p) => quoted && SAID[p]?.test(q) && !named.includes(p));
  const consoles = asked.filter((p) => CONSOLE_PLATFORMS.includes(p) && (c?.consolesNamed || []).includes(p));
  const computers = named.length ? [] : asked.filter((p) => DESKTOP.includes(p));
  return [...named, ...computers, ...consoles];
}

// The same checks import makes; agents run it on their own answer.
export function problems(answer, repos, ctxOf) {
  const out = [], got = new Map();
  for (const r of answer?.results || []) {
    if (!VERDICTS.includes(r.verdict)) out.push(`${r.repo}: verdict must be one of ${VERDICTS.join("/")}`);
    if (r.verdict !== "hide" && !CONSOLES.includes(r.console)) out.push(`${r.repo}: console "${r.console}" isn't in the list`);
    if (!String(r.title || "").trim()) out.push(`${r.repo}: title is empty`);
    if (r.verdict === "play" && !desktopOf(r, ctxOf(r.repo)).length) out.push(`${r.repo}: "play" needs a download for a computer, Android, Meta Quest or a listed console: the job lists none, and no "platforms" + verbatim "platform_quote" from the README backs one - use "soon" or "unsure"`);
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

// Writes decisions where the catalog build reads them: playable -> finds.json (GitLab/Forgejo ones -> their list file),
// Coming Soon / hidden -> waiting.json, unsure -> unsure.jsonl (a repo decided now leaves it).
function fileDecisions({ finds = [], soon = [], hide = [], unsure = [] }, listed = new Set()) {
  const now = new Date().toISOString();
  // GitLab / Codeberg games go into gitlab.json / codeberg.json (shared "list" sources every copy of the app reads), not finds.json.
  for (const host of new Set(finds.map((g) => forgeOf(g.repo)).filter(Boolean))) {
    const fo = forge(host), mine = finds.filter((g) => forgeOf(g.repo) === host);
    const file = path.join(DIR, fo.list);
    let doc = { games: [] }; try { doc = readJSON(file); } catch {}
    const byUrl = new Map(doc.games.map((g) => [g.repoUrl.toLowerCase(), g]));
    for (const g of mine) { const url = `${fo.site}/${g.repo.slice(host.length + 1)}`; byUrl.set(url.toLowerCase(), { name: g.title, repoUrl: url, console: g.console, platforms: g.platforms, version: g.version, description: g.notes }); }
    fs.writeFileSync(file, JSON.stringify({ updatedAt: now, note: `Decomp Buddy finds hosted on ${fo.label}`, games: [...byUrl.values()] }, null, 2) + "\n");
    // The list only reaches the app once the site's sources.json names it.
    const sf = path.join(DIR, "sources.json"), listUrl = `https://tanookistudios.com/decomp-buddy/${fo.list}`;
    try { const s = readJSON(sf); if (!s.sources.some((x) => x.value === listUrl)) { s.sources.push({ type: "list", value: listUrl, label: `${fo.label} Finds` }); s.updatedAt = now; fs.writeFileSync(sf, JSON.stringify(s, null, 2) + "\n"); console.log(`sources.json: added ${fo.list}`); } } catch {}
    console.log(`${fo.list}: +${mine.length} - deploy the site BEFORE rebuilding the catalog (the catalog reads the live list)`);
  }
  const github = finds.filter((g) => !forgeOf(g.repo));
  if (github.length) publishFinds(path.join(DIR, "finds.json"), github);
  const decided = new Set([...finds, ...soon, ...hide].map((g) => g.repo.toLowerCase())); // before forge prefixes are split off below
  for (const g of [...soon, ...hide]) { const host = forgeOf(g.repo); if (host) { g.repo = g.repo.slice(host.length + 1); g.host = host; } }
  const wf = path.join(DIR, "waiting.json"), w = readJSON(wf);
  // A newer decision replaces an older entry for the same repo (Maddie approving something the robot hid, ...).
  const old = (g) => g.repo && decided.has((forge(g.host) ? `${g.host}:${g.repo}` : g.repo).toLowerCase());
  w.games = w.games.filter((g) => !old(g)); w.hidden = w.hidden.filter((g) => !old(g));
  w.games.push(...soon); w.hidden.push(...hide);
  w.games.sort((a, b) => a.title.localeCompare(b.title)); w.updatedAt = now;
  fs.writeFileSync(`${wf}.tmp`, JSON.stringify(w, null, 2) + "\n"); fs.renameSync(`${wf}.tmp`, wf);
  // A repo decided now (a second look), or filed since, leaves the waiting-for-Maddie list.
  const kept = fs.existsSync(J("unsure.jsonl")) ? fs.readFileSync(J("unsure.jsonl"), "utf8").split("\n").filter(Boolean).filter((l) => { const r = JSON.parse(l).repo.toLowerCase(); return !decided.has(r) && !listed.has(r); }) : [];
  fs.writeFileSync(J("unsure.jsonl"), [...kept, ...unsure.map((u) => JSON.stringify(u))].map((l) => l + "\n").join(""));
}

function importAnswers() {
  const ctxOf = ctxByRepo(), now = new Date().toISOString(), via = "Discover queue (sorted by Claude Code)";
  const have = known(), listed = new Set(have), finds = [], soon = [], hide = [], unsure = [], rejected = [];
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
    // Batch ids restart at t001 every run: keep each answer file, or the record of what was sorted shrinks to the last run.
    fs.renameSync(J("out", f), J("done", fs.existsSync(J("done", f)) ? `${id}.${now.replace(/[:.]/g, "-")}.json` : f));
  }
  fileDecisions({ finds, soon, hide, unsure }, listed);
  try { syncQueue(); } catch (err) { console.log(`admin queue: not updated (${err.message})`); }
  console.log(`import: ${finds.length} playable, ${soon.length} Coming Soon, ${hide.length} hidden, ${unsure.length} unsure (left in the queue; listed in ${J("unsure.jsonl")})${rejected.length ? `; rejected batch(es): ${rejected.join(", ")}` : ""}`);
  for (const g of finds) console.log(`  + ${g.title} [${g.console}] ${g.repo}`);
}

const cmd = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === "prep") await prep(); else if (cmd === "check") check(process.argv[3]); else if (cmd === "import") importAnswers();
  else if (cmd === "suggestions") { adminActions(); for (const r of suggestions(known())) console.log(`  new: ${r.repo}`); }
  else { console.log("usage: triage.mjs prep|check <batch>|import|suggestions"); process.exit(1); }
}
