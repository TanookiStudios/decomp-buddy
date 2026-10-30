// What Should I Play?: three answers give three different games that fit them; See It opens one; Pick Again reshuffles.
// Run: GITHUB_TOKEN=... SMOKE_TIMEOUT=300000 scripts/smoke.sh scripts/smoke/pick.js <profile> (builds the catalog first).
const out = {};
await refresh(); await loadCatalog({ refresh: true }); showView("browse"); await wait(1500);
$("pickBtn").click(); await wait(300); out.open = !$("pickDlg").hidden; out.consoles = $("pickConsole").options.length;
$("pickConsole").value = "Nintendo 64"; $("pickHow").value = "together"; $("pickMatters").value = "looks";
$("pickGo").click(); await wait(1500);
const ids = [...$("pickOut").querySelectorAll("[data-pick]")].map((b) => b.dataset.pick), games = ids.map((id) => catalog.games.find((g) => g.id === id));
out.picks = games.map((g) => `${g.title} [${Object.keys(g.facts?.features || {}).join(",")}]`);
out.allFit = games.every((g) => g.console === "Nintendo 64" && g.facts.features?.coop && (g.facts.features.widescreen || g.facts.features.hd || g.facts.features.fps60));
out.button = $("pickGo").textContent;
$("pickOut").querySelector("[data-pick]").click(); await wait(1500);
out.view = document.querySelector("main > section.view.active").dataset.view; out.closed = $("pickDlg").hidden;
return { ok: out.open && ids.length === 3 && new Set(ids).size === 3 && out.allFit && out.button === "Pick Again" && out.view === "detail" && out.closed, ...out };
