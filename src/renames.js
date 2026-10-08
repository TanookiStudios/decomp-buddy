// GitHub owners that moved. GitHub forwards the old names, but everything Decomp Buddy keys by repo
// (catalog merging, published plans, installed games) has to agree on one name or the same game
// shows twice and loses its plan. Add a line when a catalog source reports a move.
export const OWNER_RENAMES = { alexbeav: "alexbeavs-ps1-ports" }; // 26 Sep 2026: the PS1 ports moved to an org

// Repos that stayed with the old owner when the rest moved (Forza Motorsport 4 is an Xbox 360 port, not a PS1 one).
const STAYED = new Set(["alexbeav/fm4-recomp"]);
export const canonOwner = (owner, repo) => (repo && STAYED.has(`${owner}/${repo}`.toLowerCase()) ? owner : OWNER_RENAMES[String(owner || "").toLowerCase()] || owner);
// "owner/repo" -> canonical "owner/repo" (case kept for display where not renamed)
export const canonRepo = (full) => { const [o, ...r] = String(full || "").split("/"); return r.length ? `${canonOwner(o, r.join("/"))}/${r.join("/")}` : full; };
// One name per console, so each shows once in Browse. Sources spell them their own way; these are the
// names the rest of the app already uses (boxart folders, the console guesses in sources/finds.js).
const CONSOLE_ALIASES = [[/^(nintendo )?game ?boy advance$|^gba$/i, "Game Boy Advance"], [/^nintendo entertainment system$|^famicom$/i, "NES"],
  [/^super nintendo( entertainment system)?$|^super famicom$/i, "SNES"], [/^sony playstation$|^ps1$|^psx$/i, "PlayStation"], [/^sony playstation 2$/i, "PlayStation 2"],
  [/^(sony )?playstation portable$/i, "PlayStation Portable"], [/^sega genesis$|^genesis$|^sega mega drive$/i, "Mega Drive"],
  [/^(ibm )?pc \((ms-)?dos\)$|^ms-dos$|^dos$/i, "IBM PC (MS-DOS)"], [/^nintendo gamecube$/i, "GameCube"], [/^sega (dreamcast|saturn)$/i, (m) => m.replace(/^sega /i, "")]];
export function canonConsole(c) {
  const s = String(c || "").trim(), hit = CONSOLE_ALIASES.find(([re]) => re.test(s));
  return !hit ? c : typeof hit[1] === "function" ? hit[1](s) : hit[1];
}
// Rewrite a catalog entry that points at a moved owner, and give its console the one shared name.
export function canonGame(raw) {
  const con = canonConsole(raw?.console), g = con === raw?.console ? raw : { ...raw, console: con };
  if (!g?.owner || canonOwner(g.owner, g.repo) === g.owner) return g;
  const owner = canonOwner(g.owner, g.repo);
  const swap = (s) => (typeof s === "string" ? s.replace(new RegExp(`(github\\.com/|github:|raw\\.githubusercontent\\.com/)${g.owner}/`, "ig"), `$1${owner}/`) : s);
  return { ...g, owner, id: swap(g.id), repoUrl: swap(g.repoUrl), releaseUrl: swap(g.releaseUrl), iconUrl: swap(g.iconUrl) };
}
