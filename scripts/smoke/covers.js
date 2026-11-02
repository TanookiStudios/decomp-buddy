// Save All Covers For Offline: the Settings button saves a cover for nearly every catalog game, says how many and how
// much space, and Browse then shows covers with the internet off (run again with DECOMP_OFFLINE=1 on the same profile).
const out = {};
await loadCatalog({ refresh: false }); out.games = catalog.games.length;
if (!COVERS_OFFLINE) {
  const t = Date.now(); $("coversSave").click();
  while (!/^(Done|Stopped|Couldn't)/.test($("coversStatus").textContent) && Date.now() - t < 900000) await wait(500);
  out.status = $("coversStatus").textContent; out.minutes = Math.round((Date.now() - t) / 6000) / 10;
  const saved = Number((out.status.match(/(\d+) covers saved/) || [])[1] || 0);
  return { ok: /^Done/.test(out.status) && saved > out.games * 0.85, ...out };
}
let shown = 0; for (const g of catalog.games.slice(0, 200)) if ((await window.buddy.catalogIcon?.(g.id).catch(() => null))?.dataUrl) shown++;
out.offlineCoversOf200 = shown;
return { ok: shown > 170, ...out };
