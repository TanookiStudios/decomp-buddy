// Lists: Browse's List filter offers the app's four lists and narrows Browse to one of them.
// Run: GITHUB_TOKEN=... SMOKE_TIMEOUT=300000 scripts/smoke.sh scripts/smoke/lists.js <profile> (builds the catalog first).
const out = {};
await refresh(); await loadCatalog({ refresh: true }); showView("browse"); await wait(1500);
out.options = [...$("catList").options].map((o) => o.textContent);
$("catList").value = "play-together"; $("catList").dispatchEvent(new Event("input")); await wait(800);
const ids = [...document.querySelectorAll("#catalogList .gtile")].map((t) => t.dataset.card), games = ids.map((id) => catalog.games.find((g) => g.id === id));
out.shown = ids.length; out.allTogether = games.every((g) => g.facts?.features?.coop || g.facts?.features?.online);
out.label = $("moreFiltersBtn").textContent;
return { ok: out.options.length === 5 && out.shown > 0 && out.allTogether && /\(1\)/.test(out.label), ...out };
