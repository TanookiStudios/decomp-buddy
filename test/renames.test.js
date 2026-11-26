import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSources } from "../src/catalog.js";
import { planKey } from "../src/plans.js";
import { canonRepo, canonConsole, CONSOLE_NAMES } from "../src/renames.js";
import { expandMultiGame } from "../src/expand.js";

test("a moved GitHub owner collapses onto one entry, one plan key, one installed key", () => {
  const old = { id: "github:alexbeav/ape-escape-recomp", owner: "Alexbeav", repo: "ape-escape-recomp", repoUrl: "https://github.com/Alexbeav/ape-escape-recomp", title: "Ape Escape", source: "portsdr" };
  const now = { id: "github:alexbeavs-ps1-ports/ape-escape-recomp", owner: "alexbeavs-ps1-ports", repo: "ape-escape-recomp", repoUrl: "https://github.com/alexbeavs-ps1-ports/ape-escape-recomp", title: "Ape Escape", source: "alexbeav" };
  const m = mergeSources([[old], [now]]);
  assert.equal(m.length, 1); assert.deepEqual(m[0].sources, ["portsdr", "alexbeav"]); assert.equal(m[0].repoUrl, "https://github.com/alexbeavs-ps1-ports/ape-escape-recomp");
  assert.equal(planKey("github", "Alexbeav", "ape-escape-recomp"), planKey("github", "alexbeavs-ps1-ports", "ape-escape-recomp"));
  assert.equal(canonRepo("Alexbeav/ape-escape-recomp"), "alexbeavs-ps1-ports/ape-escape-recomp");
  assert.equal(canonRepo("HarbourMasters/Shipwright"), "HarbourMasters/Shipwright");
});

test("each console gets one name, so Browse shows it once", () => {
  const g = (id, console) => ({ source: "s", id, title: id, console, platforms: [] });
  const merged = mergeSources([[g("a", "Nintendo Game Boy Advance"), g("b", "Sony PlayStation"), g("c", "PC (DOS)"), g("d", "Sega Genesis")], [g("e", "Game Boy Advance"), g("f", "PC (Windows)"), g("h", "Sega Model 2")]]);
  assert.deepEqual(merged.map((x) => x.console), ["Game Boy Advance", "PlayStation", "IBM PC (MS-DOS)", "Mega Drive", "Game Boy Advance", "PC (Windows)", "Arcade"]);
});

test("every spelling seen in the catalog lands on one plain listed name; a platform the list lacks is Others", () => {
  const want = {
    "Sony PlayStation 3": "PlayStation 3", "Sony PlayStation 4": "PlayStation 4", "Sony PlayStation 2": "PlayStation 2", "PlayStation 1": "PlayStation", "Microsoft Xbox 360": "Xbox 360", "Xbox 360 (XBLA)": "Xbox 360", "Microsoft Xbox": "Xbox",
    "Nintendo Switch (eShop)": "Nintendo Switch", "Nintendo 64 (iQue)": "Nintendo 64", "Sega CD (Mega-CD)": "Sega CD", "Nintendo Wii": "Wii", "Nintendo Game Boy": "Game Boy", "Nintendo Game Boy Color": "Game Boy Color", "Nintendo SNES": "SNES", "Nintendo GameCube": "GameCube", "Commodore Amiga": "Amiga",
    "Sega Genesis / Mega Drive": "Mega Drive", "Sega Mega Drive": "Mega Drive", "sega saturn": "Saturn", "Sega Dreamcast": "Dreamcast", "Sega Master System": "Master System", "PlayStation Portable": "PlayStation Portable",
    "MS-DOS (PC)": "IBM PC (MS-DOS)", "MS-DOS (IBM PC compatible)": "IBM PC (MS-DOS)", "IBM PC": "IBM PC (MS-DOS)", "IBM PCjr": "IBM PC (MS-DOS)", "DOS (EGA)": "IBM PC (MS-DOS)", "PC (MS-DOS / Windows)": "IBM PC (MS-DOS)",
    "Microsoft Windows": "PC (Windows)", "Microsoft Windows (PC)": "PC (Windows)", "Windows (PC, 1999)": "PC (Windows)", "PC (Steam)": "PC (Windows)", "Windows PC": "PC (Windows)", "PC (Windows/Linux)": "PC (Windows)", "Apple Macintosh / PC (Windows)": "PC (Windows)", "Personal Computer": "PC (Windows)",
    "Arcade (Konami)": "Arcade", "Arcade (T-Unit with ADPCM sound)": "Arcade", "Namco System 22 (arcade)": "Arcade", "Sega NAOMI": "Arcade", "Sega Model 2": "Arcade", "SEGA Model 2 arcade": "Arcade", "DOS / Arcade": "Arcade",
    "Sega Chihiro (arcade, Xbox-based)": "Arcade", "Taito Type X / Type X2 (arcade PC)": "Arcade", "Namco Triforce arcade system board": "Arcade", "Cave arcade board (CAVE 68000 hardware)": "Arcade",
    // Real platforms keep one plain name of their own, never a near miss ("PC-98" and "PC Engine" aren't Windows).
    "Android": "Android", "Android (mobile)": "Android", "Android / iOS mobile game (PC port)": "Android", "Apple Macintosh": "Mac", "Apple IIe": "Apple II", "Apple iPod Classic": "iPod", "Atari ST": "Atari ST", "Atari 8-bit": "Atari 8-bit",
    "Game Gear": "Game Gear", "Sega Game Gear": "Game Gear", "PC-98/PC-88": "PC-98", "PC Engine": "PC Engine", "Sega 32X": "32X", "Java ME (J2ME) mobile phone": "Java Phone", "Adobe Flash browser game (PC port)": "Adobe Flash", "Adobe Flash (browser game)": "Adobe Flash",
    "SNK Neo Geo (MVS / AES)": "Neo Geo", "BBC Micro/Acorn": "BBC Micro", "ZX Spectrum": "ZX Spectrum", "Atari Jaguar": "Atari Jaguar",
    // Not a platform we list: Others. A hand-added "Unknown" is Others too, so there's one catch-all.
    "Windows Phone 7": "Others", "Unknown": "Others", "": "",
  };
  for (const [from, to] of Object.entries(want)) assert.equal(canonConsole(from), to, from);
  for (const n of CONSOLE_NAMES) assert.equal(canonConsole(n), n);
});

test("a collection's games take their own console from the install steps; a game under the catch-all takes its plan's", () => {
  const g = (repo, console) => ({ id: `github:o/${repo}`, owner: "o", repo, title: repo, console });
  const plan = (...games) => ({ targets: { win: { games: games.map(([game_title, console]) => ({ game_title, console })) } } });
  const pub = { plans: { [planKey("github", "o", "many")]: plan(["A", "Namco System 22 (arcade)"], ["B", "Sony PlayStation 4"], ["C", ""]), [planKey("github", "o", "one")]: plan(["F-Zero", "Super Nintendo Entertainment System"]),
    [planKey("github", "o", "odd")]: plan(["Chaotix", "Sega 32X"]), [planKey("github", "o", "set")]: plan(["Kept", "Nintendo 64"]) } };
  const out = expandMultiGame([g("many", "Xbox"), g("one", "Unknown"), g("odd", "Unknown"), g("set", "Wii"), g("noplan", "Unknown"), g("other", "Others")], pub);
  assert.deepEqual(out.map((x) => x.console), ["Arcade", "PlayStation 4", "Xbox", "SNES", "32X", "Wii", "Unknown", "Others"]);
});

test("a repo that stayed behind keeps its owner when the rest moved", () => {
  assert.equal(canonRepo("alexbeav/fm4-recomp"), "alexbeav/fm4-recomp");
  assert.equal(canonRepo("alexbeav/medievil-recomp"), "alexbeavs-ps1-ports/medievil-recomp");
  assert.equal(planKey("github", "Alexbeav", "fm4-recomp"), "github:alexbeav/fm4-recomp");
  const [g] = mergeSources([[{ source: "s", id: "github:alexbeav/fm4-recomp", title: "Forza Motorsport 4", console: "Xbox 360", owner: "Alexbeav", repo: "fm4-recomp", repoUrl: "https://github.com/Alexbeav/fm4-recomp", platforms: [] }]]);
  assert.equal(g.repoUrl, "https://github.com/Alexbeav/fm4-recomp");
});
