// First start on a computer that has never run Decomp Buddy (and isn't the admin's): Browse fills within seconds
// from the published catalog (or the copy built into the app), with covers; Coming Soon and Installed Games open.
// Run by scripts/smoke/firstrun.sh on a normal network, offline, and on "terrible Wi-Fi" where nothing answers.
const out = {}, t0 = Date.now();
showView("browse");
while (!catalog.games.length && Date.now() - t0 < 60000) await wait(100);
out.secondsToGames = Math.round((Date.now() - t0) / 100) / 10;
await wait(1500);
out.games = catalog.games.length;
out.withArt = catalog.games.filter((g) => g.boxartUrl).length;
out.tiles = document.querySelectorAll("#catalogList .gtile").length;
out.meta = $("catalogMeta").textContent;
out.status = $("catalogStatus").textContent;
document.querySelector('nav.side button[data-nav="soon"]').click();
const t1 = Date.now(); while (!$("soonList").querySelector(".srcRow") && Date.now() - t1 < 15000) await wait(100);
out.soonRows = $("soonList").querySelectorAll(".srcRow").length; out.secondsToSoon = Math.round((Date.now() - t1) / 100) / 10;
document.querySelector('nav.side button[data-nav="library"]').click(); await wait(800);
out.libraryOpen = $("library").classList.contains("active");
const fast = out.secondsToGames <= 8 && out.secondsToSoon <= 8;
return { ok: fast && out.games > 1500 && out.withArt > out.games * 0.8 && out.tiles > 0 && out.soonRows > 100 && out.libraryOpen, ...out };
