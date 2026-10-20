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
