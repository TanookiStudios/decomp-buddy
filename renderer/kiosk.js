// Kiosk Mode: Couch Mode that only the PIN can leave (arcade cabinets, shared PCs).
// Leaving Couch Mode or closing the window shows an on-screen keypad: D-pad or arrows to move, A or
// Enter to press, B or Escape to go back to the games. The main process checks the PIN and keeps
// Settings-only actions, Remove Game, Set Up and web links shut while it's locked.
// Shares app.js/couch.js globals ($, settings, refresh, openCouch, closeCouch, couchOn).

let kioskLocked = false, kioskEntry = "", kioskThenClose = false;

function kioskControls() {
  const k = settings.kiosk || {};
  kioskLocked = !!k.locked;
  $("kioskOn").checked = !!k.on;
  $("kioskOff").hidden = !k.on && !k.hasPin;
  kioskSay(k.on ? "On - Decomp Buddy starts locked in Couch Mode." : k.hasPin ? "A PIN is saved. Tick Start In Kiosk Mode to lock it." : "Save a PIN first.");
}
const kioskSay = (m, cls = "") => { $("kioskState").textContent = m; $("kioskState").className = `sub ${cls}`; };
$("kioskSave").onclick = async () => {
  const a = $("kioskPin").value, b = $("kioskPin2").value;
  if (!/^\d{4,8}$/.test(a)) return kioskSay("The PIN needs 4 to 8 digits.", "bad");
  if (a !== b) return kioskSay("Those two PINs don't match - type it again.", "bad");
  try { await window.buddy.kioskSet({ pin: a }); $("kioskPin").value = $("kioskPin2").value = ""; await refresh(); kioskSay("PIN saved.", "ok"); }
  catch (err) { kioskSay(err.message.replace(/^.*Error: /, ""), "bad"); }
};
$("kioskOn").onchange = async () => {
  try {
    const r = await window.buddy.kioskSet({ on: $("kioskOn").checked });
    await refresh();
    if (r.locked) { kioskLocked = true; openCouch(); }
  } catch (err) { $("kioskOn").checked = false; kioskSay(err.message.replace(/^.*Error: /, ""), "bad"); }
};
$("kioskOff").onclick = async () => {
  try { await window.buddy.kioskSet({ off: true }); await refresh(); kioskSay("Kiosk Mode is off and the PIN is deleted.", "ok"); }
  catch (err) { kioskSay(err.message.replace(/^.*Error: /, ""), "bad"); }
};

// ---- The keypad
const kioskKeys = () => [...$("kioskKeys").querySelectorAll("button"), $("kioskCancel")];
function drawKioskDots() { $("kioskDots").textContent = "●".repeat(kioskEntry.length); $("kioskCount").textContent = kioskEntry.length ? `${kioskEntry.length} digit(s) entered` : ""; }
function askKioskPin({ thenClose = false } = {}) {
  kioskThenClose = thenClose; kioskEntry = ""; drawKioskDots(); $("kioskMsg").textContent = "";
  $("kioskPad").hidden = false; $("couchRows").inert = true;
  kioskKeys()[0].focus();
}
function hideKioskPad() { $("kioskPad").hidden = true; $("couchRows").inert = false; $("couchRows").querySelector(".ctile")?.focus(); }
async function kioskSubmit() {
  const r = await window.buddy.kioskCheck(kioskEntry);
  kioskEntry = ""; drawKioskDots();
  if (!r.ok) { $("kioskMsg").textContent = r.wait ? `Wrong PIN. Wait ${Math.ceil(r.wait / 1000)} seconds, then try again.` : "Wrong PIN"; return; }
  kioskLocked = false; $("kioskPad").hidden = true; $("couchRows").inert = false;
  if (kioskThenClose) return window.buddy.closeWindow();
  closeCouch(); await refresh();
}
function kioskKey(k) {
  if (k === "ok") return kioskSubmit();
  kioskEntry = k === "clear" ? "" : (kioskEntry + k).slice(0, 8);
  drawKioskDots();
}
// A 3 x 4 grid of keys, then Back To Games below it.
function kioskMove(dir) {
  const keys = kioskKeys(); let i = keys.indexOf(document.activeElement);
  if (i < 0) return keys[0].focus();
  if (i === 12) i = dir === "up" ? 10 : 12;
  else if (dir === "up") i = i >= 3 ? i - 3 : i;
  else if (dir === "down") i = i + 3 > 11 ? 12 : i + 3;
  else if (dir === "left") i = i % 3 ? i - 1 : i;
  else if (dir === "right") i = i % 3 < 2 ? i + 1 : i;
  keys[i].focus();
}
// couch.js sends every controller and arrow-key action here while the keypad is showing.
function kioskAction(a) {
  if (a === "up" || a === "down" || a === "left" || a === "right") kioskMove(a);
  else if (a === "a") { if ($("kioskPad").contains(document.activeElement)) document.activeElement.click(); }
  else if (a === "b" || a === "start") hideKioskPad();
}
$("kioskKeys").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b) kioskKey(b.dataset.k); });
$("kioskCancel").onclick = hideKioskPad;
// Typing the digits works too.
$("kioskPad").addEventListener("keydown", (e) => {
  if (/^\d$/.test(e.key)) { e.preventDefault(); kioskKey(e.key); }
  else if (e.key === "Backspace") { e.preventDefault(); kioskEntry = kioskEntry.slice(0, -1); drawKioskDots(); }
});
// The window's close button while locked: the main process holds the window open and asks here.
window.buddy.onKioskClose(async () => { if (!couchOn) await openCouch(); askKioskPin({ thenClose: true }); });
