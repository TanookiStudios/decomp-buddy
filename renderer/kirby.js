// Kirby AI: the question box (a dialog over Browse). The asking and the catalog look-ups happen in the main process
// (src/main/kirby.js); this shows the conversation and turns the games Kirby names into buttons that open them.
// Shares app.js globals ($, esc, catalog, showDetail).
let kirbyHistory = [], kirbyBusy = false;
// Why there's no answer, in the app's own words so they follow its language (src/kirbyask.js says the same in English).
const KIRBY_FAIL = { too_many: "That's a lot of questions for one hour. Give me a little while and ask again.", day_full: "I've answered all I can today. Come back tomorrow!", not_configured: "Kirby AI isn't switched on yet.",
  busy: "I'm swamped right now. Try again in a minute.", bad_question: "That one's too long for me. Can you ask it in a sentence or two?", too_many_steps: "I looked around for a while and didn't get to an answer. Try asking it a simpler way." };
window.buddy.kirbyReady().then((on) => { $("kirbyBtn").hidden = !on; }).catch(() => {});
function openKirby() {
  $("kirbyDlg").hidden = false; for (const el of document.querySelectorAll("body > nav, body > main")) el.inert = true;
  $("kirbyQ").focus();
}
function closeKirby() {
  $("kirbyDlg").hidden = true; for (const el of document.querySelectorAll("body > nav, body > main")) el.inert = false;
  kirbyHistory = []; $("kirbyLog").innerHTML = ""; $("kirbyBtn").focus();   // the conversation ends with the dialog
}
$("kirbyBtn").onclick = openKirby; $("kirbyClose").onclick = closeKirby;
$("kirbyDlg").addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeKirby();
  else if (e.key === "Tab") { const f = [...$("kirbyDlg").querySelectorAll("[tabindex], input, button:not([disabled])")], i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); }
});
$("kirbyForm").onsubmit = async (e) => {
  e.preventDefault(); const q = $("kirbyQ").value.trim(); if (!q || kirbyBusy) return;
  const log = $("kirbyLog"), say = (cls, html) => { log.insertAdjacentHTML("beforeend", `<div class="${cls}">${html}</div>`); log.scrollTop = log.scrollHeight; return log.lastElementChild; };
  kirbyBusy = true; $("kirbySend").disabled = true; $("kirbyQ").value = "";
  say("kq", `<span translate="no">${esc(q)}</span>`); const wait = say("ka", "<span>Sniffing around…</span>");
  let r; try { r = await window.buddy.kirbyAsk(q, kirbyHistory); } catch { r = { text: "", failed: "offline", games: [] }; }
  kirbyHistory = r.history || kirbyHistory;
  wait.innerHTML = (r.failed ? `<span>${KIRBY_FAIL[r.failed] || "Something went wrong on my end. Try again in a moment."}</span>` : `<span translate="no">${esc(r.text)}</span>`)
    + (r.games?.length ? `<div class="kgames">${r.games.map((g) => `<button type="button" class="small" data-kgame="${esc(g.id)}" translate="no">${esc(g.title)}</button>`).join("")}</div>` : "");
  log.scrollTop = log.scrollHeight; kirbyBusy = false; $("kirbySend").disabled = false; $("kirbyQ").focus();
};
$("kirbyLog").onclick = (e) => { const b = e.target.closest("[data-kgame]"); if (!b) return; const g = catalog.games.find((x) => x.id === b.dataset.kgame); if (g) { closeKirby(); showDetail(g); } };
