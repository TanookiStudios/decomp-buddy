// Controller on every screen: movement, A presses, B closes a panel, LB/RB switch screens, list boxes change with
// left/right, the Nintendo layout swaps A/B, and remapping is used. Run: scripts/smoke.sh scripts/smoke/pad.js <profile>
const out = {};
await refresh(); showView("settings"); await wait(800);
out.std = [padIndex("A"), padIndex("B"), padIndex("X")];
await window.buddy.setSettings({ padNintendo: true }); await refresh(); out.nin = [padIndex("A"), padIndex("B"), padIndex("Y")];
await window.buddy.setSettings({ padNintendo: false, padMap: { A: 7 } }); await refresh(); out.remap = padIndex("A");
await window.buddy.setSettings({ padMap: {} }); await refresh();
// Movement and A on the Settings screen.
document.activeElement?.blur(); padAction("a"); out.firstFocus = !!document.activeElement && document.activeElement !== document.body;
const before = document.activeElement; padAction("down"); out.moved = document.activeElement !== before;
const sel = $("padLayout"); sel.focus(); padAction("right"); out.selectChanged = sel.value === "nintendo"; await wait(400); padAction("left"); await wait(400);
// RB goes to the next screen.
const viewBefore = document.querySelector("main > section.view.active").dataset.view; padAction("rb"); await wait(300);
out.views = [viewBefore, document.querySelector("main > section.view.active").dataset.view];
// B closes an open panel.
$("gamePanel").hidden = false; padAction("b"); out.panelClosed = $("gamePanel").hidden;
// A stubbed controller drives the real loop (the hidden window has no focus, so pretend it does).
document.hasFocus = () => true; showView("settings"); await wait(300); $("padReset").focus();
let frame = 0; const fake = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0] };
navigator.getGamepads = () => [fake];
window.dispatchEvent(new Event("gamepadconnected"));
const press = async (i) => { fake.buttons[i].pressed = true; await wait(120); fake.buttons[i].pressed = false; await wait(120); };
let resetClicked = false; $("padReset").addEventListener("click", () => (resetClicked = true), { once: true });
await press(0); out.loopPressedA = resetClicked;
return { ok: JSON.stringify(out.std) === "[0,1,2]" && JSON.stringify(out.nin) === "[1,0,2]" && out.remap === 7 && out.firstFocus && out.moved && out.selectChanged && out.views[0] !== out.views[1] && out.panelClosed && out.loopPressedA, ...out };
