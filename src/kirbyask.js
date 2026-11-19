// Kirby AI: the part that runs where the asker is. The model (on the site, functions/api/decomp-ask.js) says what to
// look up; this looks it up in the catalog the app or the web page already holds, and carries the conversation
// back and forth until there's an answer. The website's build inlines this same file.

// One catalog game, small: what a search needs and what the model is told. Takes the app's entry or the public
// catalog's (they spell a few things differently).
const OS = { Windows: "windows", macOS: "mac", Linux: "linux", Android: "android" };
export function compactGame(g) {
  const f = g.facts || {}, deck = f.steamDeck ?? f.steam_deck, os = [...new Set((g.platforms || []).map((p) => OS[p]).filter(Boolean))];
  if (["verified", "works"].includes(deck) || os.includes("linux")) os.push("deck");
  return { id: String(g.id), title: g.title, console: g.console, project: g.project || "", aka: g.aka || [], os, features: Object.keys(f.features || {}).filter((k) => f.features[k]),
    playable: ["playable", "mostly"].includes(f.completeness), complete: f.completeness || "unknown", easy: !!g.easySetup, downloads: g.downloads || 0, stars: g.stars || 0,
    added: g.listedAt || String(g.firstSeen || "").slice(0, 10), version: g.version || "", slug: g.slug || "" };
}
const words = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
// search_games: every word must be in the title, project or another name; a title that starts with the words comes first.
export function searchGames(games, input = {}) {
  const q = words(input.text), con = words(input.console).join(" "), feats = Array.isArray(input.features) ? input.features : [];
  const hit = games.filter((g) => {
    const hay = ` ${words(`${g.title} ${g.project} ${g.aka.join(" ")}`).join(" ")} `;
    return q.every((w) => hay.includes(` ${w}`)) && (!con || words(g.console).join(" ").includes(con)) && (!input.runs_on || g.os.includes(input.runs_on))
      && feats.every((f) => g.features.includes(f)) && (!input.playable_only || g.playable) && (!input.easy_setup || g.easy);
  });
  const lead = (g) => (q.length && words(g.title).join(" ").startsWith(q.join(" ")) ? 0 : 1);
  hit.sort((a, b) => lead(a) - lead(b) || (input.sort === "newest" ? b.added.localeCompare(a.added) : b.downloads - a.downloads || b.stars - a.stars));
  const limit = Math.min(12, Math.max(1, Number(input.limit) || 8));
  return { found: hit.length, games: hit.slice(0, limit).map((g) => ({ id: g.id, title: g.title, console: g.console, project: g.project, runs_on: g.os, complete: g.complete, adds: g.features, easy_setup: g.easy, downloads: g.downloads, added: g.added })) };
}

// The games an answer names, for the buttons under it. Several ports can share a title: then the one whose project
// the answer also names, or else the first found (the most popular).
export function named(found, text) {
  const by = new Map(); for (const g of found) if (text.includes(g.title)) by.set(g.title, [...(by.get(g.title) || []), g]);
  return [...by.values()].flatMap((same) => { const said = same.filter((g) => g.project && text.includes(g.project)); return said.length ? said : same.slice(0, 1); });
}

export const KIRBY_SAYS = { too_many: "That's a lot of questions for one hour. Give me a little while and ask again.", day_full: "I've answered all I can today. Come back tomorrow!",
  not_configured: "Kirby AI isn't switched on yet.", busy: "I'm swamped right now. Try again in a minute.", bad_question: "That one's too long for me. Can you ask it in a sentence or two?" };
// One question, start to finish. history = the conversation so far (kept by the caller, sent back whole each time).
// post(messages) -> the site's answer; lookUp(name, input) -> what a tool found. Returns { text, history, games }.
export async function askKirby({ question, history = [], post, lookUp, steps = 5 }) {
  const messages = [...history, { role: "user", content: String(question).trim().slice(0, 500) }], games = new Map();
  for (let i = 0; i < steps; i++) {
    const r = await post(messages);
    if (!r?.ok) return { text: KIRBY_SAYS[r?.error] || "Something went wrong on my end. Try again in a moment.", history, games: [], failed: r?.error || "no_answer" };
    if (r.done || !r.tools?.length) {
      // Only the words go into what's kept: the look-ups have done their job, and the conversation stays small.
      const text = r.text || "I couldn't come up with an answer for that one.";
      return { text, history: [...history, messages[history.length], { role: "assistant", content: [{ type: "text", text }] }].slice(-12), games: named([...games.values()], text) };
    }
    const results = [];
    for (const t of r.tools) {
      let out; try { out = await lookUp(t.name, t.input || {}); } catch { out = { error: "That look-up failed." }; }
      for (const g of out?.games || []) games.set(g.id, g);
      results.push({ type: "tool_result", tool_use_id: t.id, content: JSON.stringify(out ?? null).slice(0, 6000) });
    }
    messages.push({ role: "assistant", content: r.content }, { role: "user", content: results });
  }
  return { text: "I looked around for a while and didn't get to an answer. Try asking it a simpler way.", history, games: [], failed: "too_many_steps" };
}
