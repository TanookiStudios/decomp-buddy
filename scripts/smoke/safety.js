// Safety Report: a catalog game's page shows the scan, who uploaded it, its license and account age, from the live
// published plans. Run: scripts/smoke.sh scripts/smoke/safety.js <throwaway profile dir>
const out = {};
await refresh(); await loadCatalog({ refresh: true }); await wait(1500);
const g = catalog.games.find((x) => /gunzrs/i.test(x.repo || "")) || catalog.games.find((x) => x.trust);
out.game = g?.title; out.hasTrust = !!g?.trust;
await showDetail(g); await wait(800);
const box = $("detailFacts").innerHTML;
out.rows = [...$("detailFacts").querySelectorAll("h3")].map((h) => h.textContent);
out.text = $("detailFacts").textContent.replace(/\s+/g, " ").slice(box.indexOf("Safety Report") >= 0 ? $("detailFacts").textContent.indexOf("Safety Report") : 0).slice(0, 400);
out.madeBy = [...$("detailFacts").querySelectorAll(".credits a")].map((a) => a.textContent);
return { ok: out.hasTrust && out.rows.includes("Made By") && out.madeBy.includes("OpenRsG") && out.rows.includes("Safety Report") && /Uploaded By/.test(out.text) && /License/.test(out.text) && /On GitHub since/.test(out.text) && !/\bsafe\b/i.test(out.text.replace("Safety Report", "")), ...out };
