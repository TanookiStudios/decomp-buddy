// Kirby AI in the app: the question box. The site holds the key and talks to the model (functions/api/decomp-ask.js
// on tanookistudios.com); this runs the look-ups it asks for against the catalog already in memory (src/kirbyask.js).
// Nothing is kept here but the open conversation, which the window holds and drops when it closes.
import { app, ipcMain } from "electron";
import { loadSettings, plansFileFor, currentTarget, state, VERSION } from "./core.js";
import { fetchPublished, planKey } from "../plans.js";
import { setupCard } from "../setupcard.js";
import { compactGame, searchGames, askKirby } from "../kirbyask.js";

const BASE = () => (process.env.DECOMP_SUGGEST_BASE || "https://tanookistudios.com").replace(/\/$/, "");
const HEAD = { "User-Agent": `decomp-buddy/${VERSION}` };
// A headless smoke never reaches the real site (DECOMP_KIRBY_LIVE points it at a stand-in).
const off = () => process.env.DECOMP_HEADLESS && !process.env.DECOMP_KIRBY_LIVE;

// Switched on? Asked once per run; the Ask Kirby button only shows when it is.
let ready = null;
ipcMain.handle("kirby:ready", async () => {
  if (off()) return false;
  if (ready === null) ready = await fetch(`${BASE()}/api/decomp-ask`, { headers: HEAD, signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).then((d) => !!d?.ready).catch(() => null);
  return !!ready;
});

// game_details: what you bring and the first start (this computer's steps), plus what the catalog says and what players reported.
async function details(id) {
  const g = state.catalogGames.find((x) => String(x.id).toLowerCase() === String(id).toLowerCase());
  if (!g) return { error: "No game with that id. Search again and use an id from the results." };
  const s = loadSettings(), pub = await fetchPublished({ file: plansFileFor(s), cacheDir: app.getPath("userData") }).catch(() => null);
  const setup = g.owner ? setupCard(pub?.plans?.[planKey(g.repoHost || "github", g.owner, g.repo)], { gameTitle: g.gameTitle || "", target: currentTarget(s) }) : null;
  const runs = await fetch(`${BASE()}/api/decomp-reports?game=${encodeURIComponent(String(g.id).toLowerCase())}`, { headers: HEAD, signal: AbortSignal.timeout(8_000) }).then((r) => r.json()).catch(() => null);
  const c = compactGame(g);
  return { title: g.title, console: g.console, project: g.project, version: g.version, runs_on: c.os, complete: c.complete, adds: g.facts?.features || {}, easy_setup: c.easy,
    you_bring: setup?.files || [], first_start: setup?.steps || [], player_reports: runs?.all ? { plays_great: runs.all[0], has_problems: runs.all[1], wont_run: runs.all[2] } : null };
}

ipcMain.handle("kirby:ask", async (_e, { question, history = [] }) => {
  const games = state.catalogGames.map(compactGame);
  const post = (messages) => fetch(`${BASE()}/api/decomp-ask`, { method: "POST", headers: { ...HEAD, "content-type": "application/json" }, body: JSON.stringify({ messages }), signal: AbortSignal.timeout(40_000) })
    .then((r) => r.json()).catch(() => null);
  return askKirby({ question, history, post, lookUp: (name, input) => (name === "search_games" ? searchGames(games, input) : name === "game_details" ? details(input.id) : { error: "No such look-up." }) });
});
