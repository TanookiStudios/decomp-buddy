// Kirby AI: the button shows once the site says it's switched on, a question runs a real catalog search in the app,
// the game Kirby names becomes a button that opens its page, and a refusal from the site is said plainly.
// Run with scripts/smoke/kirby.sh (it stands in for the site).
const out = {};
await refresh(); await loadCatalog({ refresh: false }); await wait(1500); $("whatsNew").hidden = true; showView("browse");
for (let i = 0; i < 40 && $("kirbyBtn").hidden; i++) await wait(250);
out.buttonShows = !$("kirbyBtn").hidden;
$("kirbyBtn").click(); await wait(200);
out.opens = !$("kirbyDlg").hidden && document.activeElement === $("kirbyQ") && document.querySelector("body > main").inert;
const ask = async (q) => { $("kirbyQ").value = q; $("kirbyForm").requestSubmit(); for (let i = 0; i < 80 && (kirbyBusy || !$("kirbyLog").children.length); i++) await wait(250); return $("kirbyLog").lastElementChild; };
const a = await ask("a zelda game for the n64?");
out.answer = a.textContent; out.answered = /^Try .*Ocarina/.test(a.textContent) && $("kirbyLog").querySelector(".kq").textContent === "a zelda game for the n64?";
const btn = a.querySelector("[data-kgame]"); out.namesAGame = !!btn && /Ocarina/.test(btn.textContent);
const no = await ask("too many"); out.saysWhy = /a lot of questions/.test(no.textContent);
out.keepsTheThread = kirbyHistory.length === 2;
const id = btn.dataset.kgame; $("kirbyLog").querySelector("[data-kgame]").click(); await wait(600);
out.opensTheGame = $("kirbyDlg").hidden && detailGame?.id === id && !document.querySelector("body > main").inert;
out.forgets = kirbyHistory.length === 0 && !$("kirbyLog").children.length;
return { ok: Object.entries(out).every(([, v]) => typeof v !== "boolean" || v), ...out };
