import { test } from "node:test";
import assert from "node:assert/strict";
import { matchBoxart, boxartUrl } from "../src/boxart.js";

const names = ["Valkyrie Profile (USA) (Disc 1)", "Valkyrie Profile (USA) (Disc 2)", "Valkyrie Profile (Japan) (Disc 1)", "Mummy, The (USA)", "Legacy of Kain - Soul Reaver (USA)", "Spyro the Dragon (Europe) (En,Fr,De,Es,It)", "Spyro the Dragon (USA)"];

test("box art matching handles regions, discs, 'The', and punctuation", () => {
  assert.equal(matchBoxart(names, "Valkyrie Profile", "USA").f, "Valkyrie Profile (USA) (Disc 1)");
  assert.equal(matchBoxart(names, "Valkyrie Profile", "Japan").f, "Valkyrie Profile (Japan) (Disc 1)");
  assert.equal(matchBoxart(names, "The Mummy", "USA").f, "Mummy, The (USA)");
  assert.equal(matchBoxart(names, "Legacy of Kain: Soul Reaver", "USA").f, "Legacy of Kain - Soul Reaver (USA)");
  assert.equal(matchBoxart(names, "Spyro the Dragon", "Europe").f, "Spyro the Dragon (Europe) (En,Fr,De,Es,It)");
  assert.equal(matchBoxart(names, "Spyro the Dragon", "").f, "Spyro the Dragon (USA)");
  assert.equal(matchBoxart(names, "Nonexistent Game", "USA"), null);
  assert.equal(boxartUrl("Sony_-_PlayStation", { f: "Mummy, The (USA)" }), "https://raw.githubusercontent.com/libretro-thumbnails/Sony_-_PlayStation/master/Named_Boxarts/Mummy%2C%20The%20(USA).png");
});

test("matchBoxart: accents and the 'Version' suffix", () => {
  const names = ["Pokemon - FireRed Version (USA)", "Pokemon - FireRed Version (USA, Europe) (Rev 1)", "Pokemon - LeafGreen Version (USA)"];
  assert.equal(matchBoxart(names, "Pokémon FireRed", "").f, "Pokemon - FireRed Version (USA)");
  assert.equal(matchBoxart(names, "Pokémon LeafGreen", "").f, "Pokemon - LeafGreen Version (USA)");
  assert.equal(matchBoxart(names, "Pokémon Emerald", ""), null);
});
