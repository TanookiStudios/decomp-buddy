// Couch Mode: the Library full screen, big tiles, driven by a controller (or the arrow keys).
// A plays, Y shows details, B goes back, LB/RB jump between rows, Start (or Escape) leaves.
// Works with any pad the browser maps as "standard" (Xbox, PlayStation, Switch Pro, Steam Deck).
// Shares app.js/more.js globals ($, esc, library, renderLibrary, fmtDate, playButton, TARGET_LABEL).

const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
let couchOn = false, couchRaf = null, couchPrev = [], couchRepeat = { dir: null, next: 0 }, couchReturn = null;

async function openCouch() {
  if (couchOn) return;
  couchOn = true; couchReturn = document.activeElement;
  if (!library.length) library = await window.buddy.libraryList();
  $("couch").hidden = false;
  for (const el of document.querySelectorAll("body > nav, body > main")) el.inert = true;
  window.buddy.fullscreen(true);
  drawCouch();
  couchPrev = []; couchRaf = requestAnimationFrame(pollPad);
}
function closeCouch() {
  if (!couchOn) return;
  couchOn = false; cancelAnimationFrame(couchRaf);
  $("couch").hidden = true; $("couchDetail").hidden = true;
  for (const el of document.querySelectorAll("body > nav, body > main")) el.inert = false;
  window.buddy.fullscreen(false);
  couchReturn?.focus?.();
}

const couchPlayable = (g) => (g.runsHere && g.exe) || (g.canWine && g.wineReady && g.exe);
function couchTile(g) {
  const why = couchPlayable(g) ? (g.runsHere ? "Ready to play" : "Plays through Wine (experimental)") : g.canWine ? "Windows version - set up Wine in Settings to try it" : `Built for ${TARGET_LABEL[g.target] || g.target}`;
  return `<button class="ctile${couchPlayable(g) ? "" : " dim"}" type="button" data-couch="${esc(g.key)}" aria-label="${esc(g.title)}. ${esc(why)}">
    ${g.art ? `<img src="${g.art}" alt="">` : `<span class="cnocover" translate="no">${esc(g.title)}</span>`}
    <span class="ctitle" translate="no">${esc(g.title)}</span></button>`;
}
function drawCouch() {
  const recent = library.filter((g) => g.lastPlayed).slice(0, 8);
  const rows = [recent.length && ["Continue Playing", recent], ["All Games", [...library].sort((a, b) => a.title.localeCompare(b.title))]].filter(Boolean);
  $("couchRows").innerHTML = rows.map(([t, list], r) => `<section class="crow" data-row="${r}" aria-label="${esc(t)}"><h2>${esc(t)}</h2><div class="ctiles">${list.map(couchTile).join("")}</div></section>`).join("")
    || `<p class="chint">Nothing set up yet - leave Couch Mode (Start) and set some games up first.</p>`;
  $("couchRows").querySelector(".ctile")?.focus();
  $("couchStatus").textContent = "";
}

// Spatial move between tiles: the nearest tile in that direction, preferring the same row / column.
function couchMove(dir) {
  const tiles = [...$("couchRows").querySelectorAll(".ctile")]; if (!tiles.length) return;
  const cur = document.activeElement?.classList?.contains("ctile") ? document.activeElement : null;
  if (!cur) return tiles[0].focus();
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestD = Infinity;
  for (const t of tiles) {
    if (t === cur) continue;
    const b = t.getBoundingClientRect(), x = b.left + b.width / 2 - cx, y = b.top + b.height / 2 - cy;
    const ok = dir === "left" ? x < -4 : dir === "right" ? x > 4 : dir === "up" ? y < -4 : y > 4; if (!ok) continue;
    const along = dir === "left" || dir === "right" ? Math.abs(x) : Math.abs(y), across = dir === "left" || dir === "right" ? Math.abs(y) : Math.abs(x);
    const d = along + across * 3; if (d < bestD) { bestD = d; best = t; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
}
function couchJumpRow(step) {
  const rows = [...$("couchRows").querySelectorAll(".crow")]; if (!rows.length) return;
  const i = rows.findIndex((s) => s.contains(document.activeElement));
  rows[Math.max(0, Math.min(rows.length - 1, (i < 0 ? 0 : i) + step))].querySelector(".ctile")?.focus();
}
const couchGame = () => library.find((g) => g.key === document.activeElement?.dataset?.couch);
async function couchPlay() {
  const g = couchGame(); if (!g) return;
  if (!couchPlayable(g)) { $("couchStatus").textContent = g.canWine ? `${g.title} is the Windows version - set up Wine in Settings to try it on this Mac.` : `${g.title} is built for ${TARGET_LABEL[g.target] || g.target}.`; return; }
  try { $("couchStatus").textContent = `Starting ${g.title}…`; await window.buddy.gamePlay(g.folder); $("couchStatus").textContent = `${g.title} is starting.`; }
  catch (err) { $("couchStatus").textContent = err.message.replace(/^.*Error: /, ""); }
}
function couchDetails() {
  const g = couchGame(); if (!g) return;
  const d = $("couchDetail"); d.hidden = false;
  const notes = typeof padNotes === "function" ? padNotes(g) : "";
  d.innerHTML = `<h2 translate="no">${esc(g.title)}</h2>
    <p>${esc([g.console, g.tag, TARGET_LABEL[g.target] || g.target].filter(Boolean).join(" · "))}</p>
    ${g.lastPlayed ? `<p>Last played ${esc(fmtDate(g.lastPlayed))}</p>` : ""}
    ${notes ? `<p>Controller notes: ${esc(notes)}</p>` : ""}
    <p class="chint">A Play · B Back</p>`;
  d.dataset.key = g.key;
}
function couchBack() { if (!$("couchDetail").hidden) { $("couchDetail").hidden = true; document.querySelector(`[data-couch="${CSS.escape($("couchDetail").dataset.key || "")}"]`)?.focus(); } else closeCouch(); }
function couchAction(a) {
  if (a === "up" || a === "down" || a === "left" || a === "right") { if ($("couchDetail").hidden) couchMove(a); }
  else if (a === "a") { if (!$("couchDetail").hidden) { $("couchDetail").hidden = true; document.querySelector(`[data-couch="${CSS.escape($("couchDetail").dataset.key)}"]`)?.focus(); } couchPlay(); }
  else if (a === "y") couchDetails();
  else if (a === "b") couchBack();
  else if (a === "lb") couchJumpRow(-1);
  else if (a === "rb") couchJumpRow(1);
  else if (a === "start") closeCouch();
}

// Controller: edges for buttons, held directions repeat (400 ms, then every 120 ms).
function pollPad(t) {
  if (!couchOn) return;
  const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
  if (pad) {
    const btn = (i) => !!pad.buttons[i]?.pressed;
    const pressed = (i) => btn(i) && !couchPrev[i];
    for (const [i, a] of [[PAD.A, "a"], [PAD.B, "b"], [PAD.Y, "y"], [PAD.LB, "lb"], [PAD.RB, "rb"], [PAD.START, "start"]]) if (pressed(i)) couchAction(a);
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const dir = btn(PAD.UP) || ay < -0.5 ? "up" : btn(PAD.DOWN) || ay > 0.5 ? "down" : btn(PAD.LEFT) || ax < -0.5 ? "left" : btn(PAD.RIGHT) || ax > 0.5 ? "right" : null;
    if (dir && (dir !== couchRepeat.dir || t >= couchRepeat.next)) { couchAction(dir); couchRepeat = { dir, next: t + (dir !== couchRepeat.dir ? 400 : 120) }; }
    if (!dir) couchRepeat = { dir: null, next: 0 };
    couchPrev = pad.buttons.map((b) => b.pressed);
  }
  couchRaf = requestAnimationFrame(pollPad);
}
// Keyboard works the same way (and Tab still walks the tiles).
$("couch").addEventListener("keydown", (e) => {
  const k = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "a", " ": "a", Escape: "b", i: "y", PageUp: "lb", PageDown: "rb" }[e.key];
  if (!k) return; e.preventDefault(); couchAction(k);
});
$("couchRows").addEventListener("click", (e) => { const t = e.target.closest(".ctile"); if (t) { t.focus(); couchPlay(); } });
$("couchExit").onclick = closeCouch;
$("libCouch").onclick = openCouch;
// A controller turning up while the Library is open: offer Couch Mode, once per session.
let couchOffered = false;
window.addEventListener("gamepadconnected", () => { if (!couchOn && !couchOffered && document.querySelector("main > section.view.active")?.dataset.view === "library") { couchOffered = true; toast("Controller connected - Couch Mode is in the Installed Games header"); } });
$("startCouch").onchange = () => window.buddy.setSettings({ startCouch: $("startCouch").checked });
window.buddy.couchAtStart().then((on) => { if (on) setTimeout(openCouch, 600); }).catch(() => {});
$("steamSelf").onclick = async () => {
  try { const r = await window.buddy.steamAddSelf(); $("steamSelfState").textContent = `${r.updated ? "Updated" : "Added"} - start Steam and Decomp Buddy is in your library (it opens in Couch Mode).`; }
  catch (err) { $("steamSelfState").textContent = err.message.replace(/^.*Error: /, ""); }
};
