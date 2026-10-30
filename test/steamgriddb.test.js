import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pickGame, enrichSteamGrid } from "../src/steamgriddb.js";

test("pickGame: only one exact-name match counts", () => {
  const r = [{ id: 1, name: "Halo 3" }, { id: 2, name: "Halo 3: ODST" }];
  assert.equal(pickGame(r, "Halo 3 (Xenia Canary port)"), 1);
  assert.equal(pickGame(r, "Halo 4"), null);
  assert.equal(pickGame([{ id: 3, name: "Doom" }, { id: 4, name: "DOOM" }], "Doom"), null);   // 1993 and 2016: can't tell
  assert.equal(pickGame([{ id: 5, name: "The Simpsons: Hit & Run" }], "Simpsons Hit and Run"), 5);
});

test("enrichSteamGrid fills missing covers, caches answers, and says when the key is refused", async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "sgdb-"));
  const calls = [];
  const fetch = async (url, { headers }) => {
    calls.push(url); assert.equal(headers.Authorization, "Bearer k");
    const data = url.includes("/search/") ? (url.includes("Halo") ? [{ id: 7, name: "Halo 3" }] : []) : [{ url: "https://cdn2.steamgriddb.com/grid/halo.png" }];
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
  };
  const games = [{ title: "Halo 3 (Recomp)" }, { title: "Unknown Thing" }, { title: "Has Art", boxartUrl: "x" }];
  await enrichSteamGrid(games, { cacheDir, key: "k", fetch });
  assert.equal(games[0].boxartUrl, "https://cdn2.steamgriddb.com/grid/halo.png");
  assert.equal(games[1].boxartUrl, undefined);
  assert.equal(games[2].boxartUrl, "x");
  assert.equal(calls.length, 3);   // two searches + one grid lookup; the game with art is never asked about
  const again = [{ title: "Halo 3 (Recomp)" }, { title: "Unknown Thing" }];
  await enrichSteamGrid(again, { cacheDir, key: "k", fetch });
  assert.equal(calls.length, 3);   // both answers came from the cache
  assert.equal(again[0].boxartUrl, "https://cdn2.steamgriddb.com/grid/halo.png");
  await assert.rejects(enrichSteamGrid([{ title: "New Game" }], { cacheDir, key: "k", fetch: async () => ({ ok: false, status: 401 }) }), /refused the key/);
});

test("pickGame: numerals, bracketed names, and the original of two same-name games on classic consoles", () => {
  assert.equal(pickGame([{ id: 70, name: "Fable II" }, { id: 71, name: "Fable II Pub Games" }], "Fable 2"), 70);
  assert.equal(pickGame([{ id: 36474, name: "CTR (Crash Team Racing)" }, { id: 39046, name: "Crash Tag Team Racing" }], "Crash Team Racing"), 36474);
  const sotc = [{ id: 86, name: "Shadow of the Colossus", release_date: 1129852800 }, { id: 5414306, name: "Shadow of the Colossus", release_date: 1517529600 }];
  assert.equal(pickGame(sotc, "Shadow of the Colossus (decomp)", "PlayStation 2"), 86);
  assert.equal(pickGame(sotc, "Shadow of the Colossus", "PlayStation 4"), null);   // a PS4 port could be either
  assert.equal(pickGame(sotc, "Shadow of the Colossus"), null);                    // console unknown: don't guess
  const mm = [{ id: 1, name: "Mega Man 5", release_date: 723168000 }, { id: 2, name: "Mega Man V", release_date: 775180800 }];
  assert.equal(pickGame(mm, "Mega Man V", "Game Boy"), 2);   // the name as written beats the numeral swap
  assert.equal(pickGame([{ id: 9, name: "Mega Man X" }], "Mega Man 10"), null);
});

test("enrichSteamGrid: a pick settles a title; a null pick means no cover and no lookups", async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "sgdb-"));
  const calls = [];
  const fetch = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ data: url.includes("/grids/game/33831") ? [{ url: "https://cdn2.steamgriddb.com/grid/red.png" }] : [] }) }; };
  const games = [{ title: "Pokémon Red and Blue" }, { title: "Dutchman Alfa" }];
  await enrichSteamGrid(games, { cacheDir, key: "k", fetch, picks: { "pokemon red and blue": 33831, "dutchman alfa": null } });
  assert.equal(games[0].boxartUrl, "https://cdn2.steamgriddb.com/grid/red.png");
  assert.equal(games[1].boxartUrl, undefined);
  assert.deepEqual(calls.map((u) => u.split("?")[0].replace(/^.*\/v2/, "")), ["/grids/game/33831"]);   // no search for either
});
