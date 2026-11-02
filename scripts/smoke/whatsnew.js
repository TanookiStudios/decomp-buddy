// What's New: after an upgrade the window lists every version since the one you had, once; the menu shows them all.
// Run by scripts/smoke/whatsnew.sh with SMOKE_EXPECT=upgrade (settings say 0.30.7) or fresh (no settings file).
const out = {}, want = window.SMOKE_EXPECT || "upgrade";
await wait(2500);
const versions = () => [...document.querySelectorAll("#whatsNewBody h3")].map((h) => h.textContent.split(" · ")[0]);
out.shownAtStart = !$("whatsNew").hidden; out.atStart = versions();
out.navInert = document.querySelector("body > nav").inert;
if (out.shownAtStart) { $("whatsNewClose").click(); await wait(400); }
out.pendingAfterClose = (await window.buddy.getSettings()).whatsNewPending;
$("whatsNewBtn").click(); await wait(800);
out.all = versions(); out.allHasDates = [...document.querySelectorAll("#whatsNewBody h3")].slice(1).every((h) => / · /.test(h.textContent));
out.headings = [...document.querySelectorAll("#whatsNewBody h2")].slice(0, 3).map((h) => h.textContent);
$("whatsNewClose").click(); await wait(300);
const ver = (await window.buddy.getSettings()).version;
const startOk = want === "upgrade" ? out.shownAtStart && out.navInert && out.atStart[0] === `Version ${ver}` && !out.atStart.includes("Version 0.30.7") : !out.shownAtStart;
return { ok: startOk && out.pendingAfterClose === false && out.all.length >= 21 && out.all[0] === `Version ${ver}` && out.all.at(-1) === "Version 0.29.0" && out.allHasDates && $("whatsNew").hidden, want, ver, ...out, all: out.all.length };
