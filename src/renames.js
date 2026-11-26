// GitHub owners that moved. GitHub forwards the old names, but everything Decomp Buddy keys by repo
// (catalog merging, published plans, installed games) has to agree on one name or the same game
// shows twice and loses its plan. Add a line when a catalog source reports a move.
export const OWNER_RENAMES = { alexbeav: "alexbeavs-ps1-ports" }; // 26 Sep 2026: the PS1 ports moved to an org

// Repos that stayed with the old owner when the rest moved (Forza Motorsport 4 is an Xbox 360 port, not a PS1 one).
const STAYED = new Set(["alexbeav/fm4-recomp"]);
export const canonOwner = (owner, repo) => (repo && STAYED.has(`${owner}/${repo}`.toLowerCase()) ? owner : OWNER_RENAMES[String(owner || "").toLowerCase()] || owner);
// "owner/repo" -> canonical "owner/repo" (case kept for display where not renamed)
export const canonRepo = (full) => { const [o, ...r] = String(full || "").split("/"); return r.length ? `${canonOwner(o, r.join("/"))}/${r.join("/")}` : full; };
// One name per console, so each shows once in Browse. These are the only names a game is filed under (the
// sorter, scripts/triage.mjs, has to pick from this list). Plain names only: no maker, no board, no "(arcade)".
export const CONSOLE_NAMES = ["PlayStation", "PlayStation 2", "PlayStation 3", "PlayStation 4", "PlayStation Portable", "Xbox", "Xbox 360", "Nintendo 64", "GameCube", "Wii", "Wii U",
  "Nintendo Switch", "Nintendo Switch 2", "NES", "SNES", "Game Boy", "Game Boy Color", "Game Boy Advance", "Nintendo DS", "Nintendo 3DS", "Virtual Boy", "Mega Drive", "Master System", "Sega CD", "32X", "Saturn",
  "Dreamcast", "Game Gear", "Neo Geo", "PC Engine", "Arcade", "IBM PC (MS-DOS)", "PC (Windows)", "PC-98", "Mac", "Amiga", "Commodore 64", "Apple II", "Atari 2600", "Atari 8-bit", "Atari ST", "Atari Jaguar",
  "Atari Lynx", "BBC Micro", "MSX", "ZX Spectrum", "Android", "iPod", "Java Phone", "Adobe Flash", "Others"];
// Lists and install steps spell consoles their own way ("Sony PlayStation 3", "Namco System 22 (arcade)"). Exact
// spellings first, then the loose families in order: an arcade board that says "Xbox-based" or "DOS" is still Arcade.
const CONSOLE_ALIASES = [[/^(nintendo )?game ?boy advance$|^gba$/i, "Game Boy Advance"], [/^nintendo entertainment system$|^famicom$/i, "NES"],
  [/^super nintendo( entertainment system)?$|^super famicom$/i, "SNES"], [/^sony playstation$|^(sony )?playstation 1$|^ps1$|^psx$/i, "PlayStation"],
  [/^(ibm )?pc \((ms-)?dos\)$|^ms-dos$|^dos$|^ms-dos pc$|^pc \(ms-dos ?\/ ?windows\)$/i, "IBM PC (MS-DOS)"], [/^pc$|^windows$/i, "PC (Windows)"], [/^xbox 360 ?\/ ?pc \(windows\)$/i, "Xbox 360"],
  [/\bflash\b/i, "Adobe Flash"], [/android/i, "Android"], [/\bipod\b/i, "iPod"], [/j2me|java me/i, "Java Phone"], [/neo ?geo/i, "Neo Geo"], [/\b32x\b/i, "32X"],
  [/pc engine|turbografx/i, "PC Engine"], [/pc-98|pc-88/i, "PC-98"], [/^apple ii/i, "Apple II"], [/bbc micro|acorn/i, "BBC Micro"], [/^msx/i, "MSX"], [/zx spectrum/i, "ZX Spectrum"],
  [/arcade|\bnaomi\b|\bmodel [123]\b/i, "Arcade"], [/\bdos\b|^ibm pc/i, "IBM PC (MS-DOS)"], [/windows(?! (phone|mobile|ce)\b)|^pc \(|^personal computer$/i, "PC (Windows)"],
  [/macintosh|^mac ?os$/i, "Mac"], [/genesis|mega drive/i, "Mega Drive"]];
// "Unknown" (a hand-added game nobody gave a console) shows as Others: one catch-all, not two.
const BY_LOWER = new Map([...CONSOLE_NAMES.map((n) => [n.toLowerCase(), n]), ["unknown", "Others"]]);
// Always one of CONSOLE_NAMES; a platform the list doesn't have is "Others". Nothing in, nothing out.
export function canonConsole(c) {
  const s = String(c || "").trim(); if (!s) return c;
  // "Sony PlayStation 3", "Nintendo Wii", "Xbox 360 (XBLA)": the maker and a trailing note aren't part of the name.
  const plain = s.replace(/ \([^)]*\)$/, ""), bare = plain.replace(/^(sony|microsoft|nintendo|sega|commodore|apple|snk|nec) /i, "");
  return BY_LOWER.get(s.toLowerCase()) || BY_LOWER.get(plain.toLowerCase()) || BY_LOWER.get(bare.toLowerCase()) || CONSOLE_ALIASES.find(([re]) => re.test(s))?.[1] || "Others";
}
// Rewrite a catalog entry that points at a moved owner, and give its console the one shared name.
export function canonGame(raw) {
  const con = canonConsole(raw?.console), g = con === raw?.console ? raw : { ...raw, console: con };
  if (!g?.owner || canonOwner(g.owner, g.repo) === g.owner) return g;
  const owner = canonOwner(g.owner, g.repo);
  const swap = (s) => (typeof s === "string" ? s.replace(new RegExp(`(github\\.com/|github:|raw\\.githubusercontent\\.com/)${g.owner}/`, "ig"), `$1${owner}/`) : s);
  return { ...g, owner, id: swap(g.id), repoUrl: swap(g.repoUrl), releaseUrl: swap(g.releaseUrl), iconUrl: swap(g.iconUrl) };
}
