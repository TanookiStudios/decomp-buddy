// First start: while the game list loads, Browse, New Games and Games You May Like say "Loading games…" instead of sitting
// empty, and the games replace it when they arrive. Run on a FRESH profile: GITHUB_TOKEN=... SMOKE_TIMEOUT=300000 scripts/smoke.sh scripts/smoke/loading.js <new profile>
const out = { seen: {}, firstText: $("catalogList").textContent.trim().slice(0, 40) };
showView("browse");
const t0 = Date.now();
while (!catalog.games.length && Date.now() - t0 < 280000) {
  for (const id of ["catalogList", "newList", "forYouList"]) if ($(id).textContent.includes("Loading games")) out.seen[id] = true;
  await wait(200);
}
await wait(1500);
out.games = catalog.games.length; out.seconds = Math.round((Date.now() - t0) / 1000);
out.after = $("catalogList").querySelectorAll(".tile, .card, [data-id]").length;
out.stillLoading = $("catalogList").textContent.includes("Loading games");
return { ok: out.seen.catalogList && out.seen.newList && out.seen.forYouList && out.games > 1000 && out.after > 0 && !out.stillLoading, ...out };
