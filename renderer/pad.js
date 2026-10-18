// Controllers everywhere: the D-pad or left stick moves between buttons on any screen, A presses, B goes back,
// LB / RB switch screens, Start opens Couch Mode. Buttons can be remapped in Settings, and a Nintendo-style layout
// swaps A/B and X/Y. Couch Mode uses the same mapping (padIndex).
// Shares app.js's globals ($, settings, toast, openCouch, couchOn).

const PAD_DEFAULT = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, BACK: 8, START: 9 };
const PAD_DIRS = { UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
// The button index for a name, after your remapping and the Nintendo swap.
function padIndex(name) {
  if (PAD_DIRS[name] !== undefined) return PAD_DIRS[name];
  const map = { ...PAD_DEFAULT, ...(settings.padMap || {}) };
  const swap = settings.padNintendo ? { A: "B", B: "A", X: "Y", Y: "X" }[name] : null;
  return map[swap || name];
}

// The nearest focusable thing in a direction, preferring the same row / column (Couch Mode's tiles use it too).
function moveFocus(items, dir) {
  if (!items.length) return;
  const cur = items.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) return items[0].focus();
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestD = Infinity;
  for (const t of items) {
    if (t === cur) continue;
    const b = t.getBoundingClientRect(), x = b.left + b.width / 2 - cx, y = b.top + b.height / 2 - cy;
    const ok = dir === "left" ? x < -4 : dir === "right" ? x > 4 : dir === "up" ? y < -4 : y > 4; if (!ok) continue;
    const along = dir === "left" || dir === "right" ? Math.abs(x) : Math.abs(y), across = dir === "left" || dir === "right" ? Math.abs(y) : Math.abs(x);
    const d = along + across * 3; if (d < bestD) { bestD = d; best = t; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
// What the controller can reach now: the open panel if there is one, else the side menu and the current screen.
function padTargets() {
  const panel = !$("gamePanel").hidden ? $("gamePanel") : null;
  const scopes = panel ? [panel] : [document.querySelector("nav.side"), document.querySelector("main > section.view.active"), ...document.querySelectorAll("main > .banner:not([hidden]), #updateBar")].filter(Boolean);
  return scopes.flatMap((s) => [...s.querySelectorAll(FOCUSABLE)]).filter((el) => el.offsetParent !== null && !el.closest("[hidden],[inert]"));
}

function padAction(a) {
  const el = document.activeElement;
  if (["up", "down", "left", "right"].includes(a)) {
    // On a list box or slider, left / right change it instead of moving away.
    if (el?.tagName === "SELECT" && (a === "left" || a === "right")) { el.selectedIndex = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + (a === "right" ? 1 : -1))); el.dispatchEvent(new Event("change", { bubbles: true })); el.dispatchEvent(new Event("input", { bubbles: true })); return; }
    if (el?.type === "range" && (a === "left" || a === "right")) { a === "right" ? el.stepUp() : el.stepDown(); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return; }
    return moveFocus(padTargets(), a);
  }
  if (a === "a") {
    if (!el || el === document.body) return padTargets()[0]?.focus();
    if (el.matches('input[type="text"], input[type="search"], input[type="password"], input:not([type]), textarea')) { el.focus(); window.buddy.deckKeyboard?.(); return; } // Steam Deck: its on-screen keyboard
    el.click();
  } else if (a === "b") {
    if (!$("gamePanel").hidden) { $("gamePanelClose")?.click(); if (!$("gamePanel").hidden) $("gamePanel").hidden = true; }
    else document.activeElement?.blur();
  } else if (a === "lb" || a === "rb") {
    const navs = [...document.querySelectorAll("nav.side button[data-nav]")].filter((b) => b.offsetParent !== null);
    const at = navs.findIndex((b) => b.classList.contains("active") || b.getAttribute("aria-current") === "page");
    const next = navs[(Math.max(0, at) + (a === "rb" ? 1 : -1) + navs.length) % navs.length]; next?.click(); next?.focus();
  } else if (a === "start") openCouch();
}

// One loop for every screen: Couch Mode and Kiosk Mode have their own (couch.js), so this stays out of their way.
let padPrev = [], padRepeat = { dir: null, next: 0 }, padRaf = 0, padCapture = null;
function padLoop(t) {
  const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
  if (!pad) { padRaf = 0; return; }
  const btn = (i) => !!pad.buttons[i]?.pressed, pressed = (i) => btn(i) && !padPrev[i];
  if (padCapture) { const i = pad.buttons.findIndex((b, k) => b.pressed && !padPrev[k]); if (i >= 0) { padCapture(i); padCapture = null; } }
  else if (!couchOn && document.hasFocus()) {
    for (const [n, a] of [["A", "a"], ["B", "b"], ["LB", "lb"], ["RB", "rb"], ["START", "start"]]) if (pressed(padIndex(n))) padAction(a);
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const dir = btn(PAD_DIRS.UP) || ay < -0.5 ? "up" : btn(PAD_DIRS.DOWN) || ay > 0.5 ? "down" : btn(PAD_DIRS.LEFT) || ax < -0.5 ? "left" : btn(PAD_DIRS.RIGHT) || ax > 0.5 ? "right" : null;
    if (dir && (dir !== padRepeat.dir || t >= padRepeat.next)) { padAction(dir); padRepeat = { dir, next: t + (dir !== padRepeat.dir ? 400 : 120) }; }
    if (!dir) padRepeat = { dir: null, next: 0 };
  }
  padPrev = pad.buttons.map((b) => b.pressed);
  padRaf = requestAnimationFrame(padLoop);
}
window.addEventListener("gamepadconnected", () => { if (!padRaf) padRaf = requestAnimationFrame(padLoop); });
if ([...(navigator.getGamepads?.() || [])].some(Boolean)) padRaf = requestAnimationFrame(padLoop);

// ---- Settings → Controller: layout and remapping (press Change, then the button you want).
const PAD_LABEL = { A: "A (Press)", B: "B (Back)", X: "X", Y: "Y (Details)", LB: "LB (Previous Screen)", RB: "RB (Next Screen)", BACK: "Back / Select", START: "Start (Couch Mode)" };
function renderPadSettings() {
  $("padLayout").value = settings.padNintendo ? "nintendo" : "xbox";
  const map = { ...PAD_DEFAULT, ...(settings.padMap || {}) };
  $("padMapList").innerHTML = Object.keys(PAD_DEFAULT).map((n) => `<div class="srcRow"><span></span><div class="lab">${esc(PAD_LABEL[n])}</div><span class="sub">Button ${map[n]}</span><button type="button" class="small" data-padset="${n}" aria-label="Change the controller button for ${esc(PAD_LABEL[n])}">Change</button></div>`).join("");
}
$("padLayout").onchange = async () => { await window.buddy.setSettings({ padNintendo: $("padLayout").value === "nintendo" }); await refresh(); renderPadSettings(); };
$("padMapList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-padset]"); if (!b) return;
  if (![...(navigator.getGamepads?.() || [])].some(Boolean)) { $("padState").textContent = "Connect a controller and press any button on it first."; return; }
  b.textContent = "Press Any Button…"; $("padState").textContent = `Press the controller button you want for ${PAD_LABEL[b.dataset.padset]}.`;
  if (!padRaf) padRaf = requestAnimationFrame(padLoop);
  padCapture = async (i) => { await window.buddy.setSettings({ padMap: { ...(settings.padMap || {}), [b.dataset.padset]: i } }); await refresh(); renderPadSettings(); $("padState").textContent = `Saved: button ${i}.`; };
});
$("padReset").onclick = async () => { await window.buddy.setSettings({ padMap: {}, padNintendo: false }); await refresh(); renderPadSettings(); $("padState").textContent = "Back to the standard buttons."; };
document.querySelector('nav.side button[data-nav="settings"]')?.addEventListener("click", renderPadSettings);
