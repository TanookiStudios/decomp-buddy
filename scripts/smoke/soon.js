// Coming Soon: the tab loads the live waiting list, search + console filter narrow it, Open is wired,
// and nothing on the list leaks into the catalog.
const out = {};
document.querySelector('nav.side button[data-nav="soon"]').click();
for (let i = 0; i < 40 && !$("soonList").querySelector(".srcRow"); i++) await wait(500);
out.visible = $("soon").classList.contains("active");
out.rows = $("soonList").querySelectorAll(".srcRow").length;
out.meta = $("soonMeta").textContent;
out.consoles = $("soonConsole").options.length - 1;
$("soonSearch").value = "pokemon red"; $("soonSearch").oninput(); out.search = [...$("soonList").querySelectorAll(".lab")].map((e) => e.textContent);
$("soonSearch").value = ""; $("soonConsole").value = "Game Boy"; $("soonConsole").onchange(); out.gameBoy = $("soonList").querySelectorAll(".srcRow").length;
out.openLabel = $("soonList").querySelector("[data-soon]")?.getAttribute("aria-label");
out.openUrl = $("soonList").querySelector("[data-soon]")?.dataset.soon;
await loadCatalog({ refresh: true });
const w = await window.buddy.comingSoon(false);
const held = new Set(w.games.map((g) => g.repo.toLowerCase()));
out.catalog = catalog.games.length;
out.leaked = catalog.games.filter((g) => g.owner && held.has(`${g.owner}/${g.repo}`.toLowerCase())).map((g) => `${g.owner}/${g.repo}`);
return { ok: out.leaked.length === 0 && out.visible && out.rows > 1000 && out.search.length >= 1 && out.gameBoy > 0 && out.gameBoy < out.rows && /^https:\/\/github\.com\//.test(out.openUrl || ""), ...out };
