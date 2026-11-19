import { test } from "node:test";
import assert from "node:assert/strict";
import { compactGame, searchGames, askKirby, named } from "../src/kirbyask.js";

const app = (over) => compactGame({ id: "github:a/b", title: "The Legend of Zelda: Ocarina of Time", console: "Nintendo 64", project: "Ship of Harkinian", platforms: ["Windows", "Linux"], downloads: 9, easySetup: true,
  facts: { completeness: "playable", steam_deck: "verified", features: { mods: "yes", coop: "" } }, firstSeen: "2026-09-13T00:00:00.000Z", ...over });
const GAMES = [app(), app({ id: "github:c/d", title: "Mario Kart 64", project: "SpaghettiKart", downloads: 50, platforms: ["Windows"], facts: { completeness: "wip", features: { coop: "4 players" } }, easySetup: false, firstSeen: "2026-11-01T00:00:00.000Z" }),
  compactGame({ id: "github:e/f", slug: "oldamber", title: "Pokemon Red/Blue (OldAmber)", console: "Game Boy", platforms: ["macOS"], aka: ["Pokémon Edición Roja"], listedAt: "2026-11-18", facts: { completeness: "mostly", steamDeck: "none" } })];

test("search_games: words, another name, console, what it runs on, what it adds, and the order", () => {
  const titles = (i) => searchGames(GAMES, i).games.map((g) => g.title);
  assert.deepEqual(titles({ text: "zelda ocarina" }), ["The Legend of Zelda: Ocarina of Time"]);
  assert.deepEqual(titles({ text: "pokemon roja" }), ["Pokemon Red/Blue (OldAmber)"]);
  assert.deepEqual(titles({ console: "nintendo 64" }), ["Mario Kart 64", "The Legend of Zelda: Ocarina of Time"]);      // most downloaded first
  assert.deepEqual(titles({ sort: "newest" })[0], "Pokemon Red/Blue (OldAmber)");
  assert.deepEqual(titles({ runs_on: "deck" }), ["The Legend of Zelda: Ocarina of Time"]);                               // Linux or a Deck report
  assert.deepEqual(titles({ features: ["coop"] }), ["Mario Kart 64"]);                                                   // an empty feature isn't one
  assert.deepEqual(titles({ playable_only: true, easy_setup: true }), ["The Legend of Zelda: Ocarina of Time"]);
  assert.deepEqual(searchGames(GAMES, { text: "zzz" }), { found: 0, games: [] });
  assert.equal(searchGames(GAMES, { limit: 99 }).games.length, 3); assert.equal(searchGames(GAMES, { limit: 1 }).found, 3);
});

test("askKirby: runs the look-ups the site asks for, sends the model's turn back untouched, keeps only the words", async () => {
  const sent = [], turn = [{ type: "thinking", thinking: "", signature: "s" }, { type: "tool_use", id: "t1", name: "search_games", input: { text: "zelda" } }];
  const replies = [{ ok: true, done: false, tools: [{ id: "t1", name: "search_games", input: { text: "zelda" } }], content: turn }, { ok: true, done: true, text: "Try The Legend of Zelda: Ocarina of Time.", tools: [] }];
  const r = await askKirby({ question: "  a zelda game?  ", post: async (m) => { sent.push(JSON.parse(JSON.stringify(m))); return replies.shift(); }, lookUp: (name, input) => searchGames(GAMES, input) });
  assert.equal(r.text, "Try The Legend of Zelda: Ocarina of Time.");
  assert.deepEqual(r.games.map((g) => g.id), ["github:a/b"]);                           // the games it named, for the buttons
  assert.equal(sent[0][0].content, "a zelda game?");
  assert.deepEqual(sent[1][1], { role: "assistant", content: turn });
  assert.equal(sent[1][2].content[0].tool_use_id, "t1"); assert.match(sent[1][2].content[0].content, /Ocarina of Time/);
  assert.deepEqual(r.history, [{ role: "user", content: "a zelda game?" }, { role: "assistant", content: [{ type: "text", text: r.text }] }]);
});

test("askKirby: a refusal from the site is said plainly, a broken look-up doesn't end the chat, and it gives up after a few steps", async () => {
  assert.match((await askKirby({ question: "hi", post: async () => ({ ok: false, error: "too_many" }), lookUp: () => null })).text, /a lot of questions/);
  assert.equal((await askKirby({ question: "hi", post: async () => null, lookUp: () => null })).failed, "no_answer");
  let n = 0; const loop = await askKirby({ question: "hi", post: async () => ({ ok: true, done: false, tools: [{ id: `t${n++}`, name: "game_details", input: {} }], content: [] }), lookUp: () => { throw new Error("boom"); } });
  assert.equal(loop.failed, "too_many_steps"); assert.equal(n, 5);
});

test("named: one button per game the answer names - of several ports with one title, the project it mentions, else the first", () => {
  const ports = [{ id: "1", title: "Mario Kart 64", project: "SpaghettiKart" }, { id: "2", title: "Mario Kart 64", project: "mk64-port" }, { id: "3", title: "Star Fox 64", project: "Starship" }];
  assert.deepEqual(named(ports, "Mario Kart 64 runs through SpaghettiKart.").map((g) => g.id), ["1"]);
  assert.deepEqual(named(ports, "Try Mario Kart 64 or Star Fox 64.").map((g) => g.id), ["1", "3"]);
  assert.deepEqual(named(ports, "Mario Kart 64: SpaghettiKart or mk64-port.").map((g) => g.id), ["1", "2"]);
  assert.deepEqual(named(ports, "Nothing here."), []);
});
