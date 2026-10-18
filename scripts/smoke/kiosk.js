const out = {};
const locked = async () => (await window.buddy.getSettings()).kiosk.locked;
const msg = () => $("kioskMsg").textContent;
const typePin = async (pin) => { for (const d of pin) $("kioskKeys").querySelector(`[data-k="${d}"]`).click(); $("kioskKeys").querySelector('[data-k="ok"]').click(); await wait(500); };
await refresh(); showView("settings"); await wait(300);
// Ticking Start In Kiosk Mode before there's a PIN says why and stays off.
$("kioskOn").checked = true; $("kioskOn").dispatchEvent(new Event("change")); await wait(400);
out.noPinYet = `${$("kioskOn").checked} / ${$("kioskState").textContent}`;
$("kioskPin").value = "2580"; $("kioskPin2").value = "2581"; $("kioskSave").click(); await wait(300);
out.mismatch = $("kioskState").textContent;
$("kioskPin2").value = "2580"; $("kioskSave").click(); await wait(800);
out.saved = $("kioskState").textContent;
$("kioskOn").checked = true; $("kioskOn").dispatchEvent(new Event("change")); await wait(1200);
out.couchOpen = !$("couch").hidden; out.mainInert = document.querySelector("body > main").inert; out.atStart = await window.buddy.couchAtStart();
// Locked: no Remove Game, no Set Up, no kiosk changes.
out.removeRefused = await window.buddy.gameRemove("Alpha - N64").then(() => "removed!", (e) => e.message.replace(/^.*Error: /, ""));
out.kioskOffRefused = await window.buddy.kioskSet({ off: true }).then(() => "turned off!", (e) => e.message.replace(/^.*Error: /, ""));
// Closing the window (the same close the title-bar button does): the main process keeps it open and the keypad comes up.
await window.buddy.closeWindow(); await wait(600);
out.closeAsksPin = !$("kioskPad").hidden && kioskThenClose;
$("kioskCancel").click(); await wait(200);
// Escape at the top level asks for the PIN instead of leaving.
$("couch").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(300);
out.escapeAsksPin = !$("kioskPad").hidden && $("couch").hidden === false;
await typePin("1111"); out.wrong1 = msg(); out.lockedAfterWrong = await locked() && !$("couch").hidden;
await typePin("1112"); await typePin("1113"); out.wrong3 = msg();
await typePin("2580"); out.rightDuringWait = msg(); out.lockedDuringWait = await locked();
await wait(3100);
// The right PIN on a controller: 1 -> right 2, down 5, down 8, down 0, right OK, pressing A on each.
let pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0] };
Object.defineProperty(navigator, "getGamepads", { value: () => [pad], configurable: true });
const press = async (i) => { pad.buttons[i] = { pressed: true }; await wait(120); pad.buttons[i] = { pressed: false }; await wait(120); };
$("kioskKeys").querySelector('[data-k="1"]').focus();
for (const dir of [15, 13, 13, 13]) { await press(dir); await press(0); }
out.dots = $("kioskDots").textContent.length;
await press(15); out.onOk = document.activeElement?.dataset.k; await press(0); await wait(600);
out.unlocked = $("couch").hidden && !(await locked()) && !document.querySelector("body > main").inert;
out.stillOnAfterUnlock = (await window.buddy.getSettings()).kiosk.on;
return {
  ok: !/true/.test(out.noPinYet) && /match/.test(out.mismatch) && out.couchOpen && out.atStart && /Kiosk/.test(out.removeRefused) && /locked/.test(out.kioskOffRefused)
    && out.closeAsksPin && out.escapeAsksPin && out.wrong1 === "Wrong PIN" && out.lockedAfterWrong && /Wait 3 seconds/.test(out.wrong3) && out.lockedDuringWait
    && out.dots === 4 && out.onOk === "ok" && out.unlocked && out.stillOnAfterUnlock,
  ...out,
};
