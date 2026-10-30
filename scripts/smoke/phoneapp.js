// iPhone App page: menu entry opens it, screenshots load, "coming soon" while there's no App Store link, the pop-up
// stays off (no link yet), and starts are counted. Doesn't switch Phone Link on (the real app may hold its port).
// Run: scripts/smoke.sh scripts/smoke/phoneapp.js <throwaway profile dir>
const out = {};
await wait(800);
document.querySelector('[data-nav="phoneapp"]').click(); await wait(1200);
out.view = document.querySelector("main > section.view.active")?.dataset.view;
out.shots = [...document.querySelectorAll("#phoneapp .phoneShots img")].map((i) => i.complete && i.naturalWidth > 0);
out.note = $("phoneStoreNote").textContent; out.storeHidden = $("phoneStore").hidden;
out.popupHidden = $("phoneAd").hidden;
out.launches = (await window.buddy.getSettings()).launches;
return { ok: out.view === "phoneapp" && out.shots.length === 4 && out.shots.every(Boolean) && out.note === "Coming soon to the App Store." && out.storeHidden && out.popupHidden && out.launches >= 1, ...out };
