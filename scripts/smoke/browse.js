// Browse: the Console pull-down filters to one console, Space/arrows/click pick and move, More Filters counts what's on.
// Run: scripts/smoke.sh scripts/smoke/browse.js <throwaway profile dir with a cached catalog.json>
const out = {};
await refresh(); await wait(1500); $("whatsNewClose")?.click(); // the What's New window after an update holds the keyboard
out.active = document.querySelector("main > section.view.active").dataset.view;
await loadCatalog({ refresh: false }); showView("browse"); await wait(1500);
const gba = $("catCon"); gba.value = "Game Boy Advance"; gba.dispatchEvent(new Event("input")); await wait(300);
out.gba = { options: gba.options.length, noBar: !document.querySelector(".conbar, #conBar"), tiles: document.querySelectorAll("#catalogList .gtile").length, heads: document.querySelectorAll("#catalogList .group-head").length, allConsoles: new Set([...document.querySelectorAll("#catalogList .gtile")].map((t) => catalog.games.find((g) => g.id === t.dataset.card)?.console)).size };
const first = document.querySelector("#catalogList .gtile"); first.focus(); first.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); await wait(200);
out.spacePicked = catSelected.has(first.dataset.card) && document.activeElement?.dataset.card === first.dataset.card;
first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); await wait(100);
out.arrowMoved = document.activeElement?.classList.contains("gtile") && document.activeElement !== first;
const btn = document.querySelector('#catalogList [data-cat="pick"]:not([aria-pressed="true"])'); const id = btn.dataset.id; btn.click(); await wait(200);
out.clickPicked = catSelected.has(id) && document.activeElement?.dataset.id === id && document.activeElement.getAttribute("aria-pressed") === "true";
$("moreFiltersBtn").click(); $("catPlayable").checked = true; $("catPlayable").dispatchEvent(new Event("input")); await wait(200);
out.moreFilters = { label: $("moreFiltersBtn").textContent, expanded: $("moreFiltersBtn").getAttribute("aria-expanded") };
$("clearFilters").click(); await wait(100); out.cleared = $("moreFiltersBtn").textContent;
showView("new"); await wait(500); out.newPickCount = $("newgames").querySelector(".pickCount").textContent;
return { ok: out.active === "browse" && out.gba.allConsoles === 1 && out.gba.noBar && out.gba.options > 20 && out.gba.heads === 0 && out.spacePicked && out.arrowMoved && out.clickPicked && out.moreFilters.label === "More Filters (1)" && out.cleared === "More Filters" && out.newPickCount === "2 selected", ...out };
