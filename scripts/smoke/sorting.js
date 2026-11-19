// Browse's sort menu and quick toggles (Easy Setup, Multiplayer, Hide AI-Assisted), box art shown whole, the
// Big Picture Mode button on every screen, and a game page's numbers and More Like This tiles. Run: scripts/smoke.sh scripts/smoke/sorting.js <throwaway profile dir>
const out = {};
await refresh(); await wait(1500);
await loadCatalog({ refresh: false }); showView("browse"); await wait(1500);
// Known numbers on three games, so the order is certain whatever the catalog holds.
const [a, b, c] = catalog.games;
Object.assign(a, { stars: 5, downloads: 9e9, easySetup: true, firstSeen: "2020-01-01T00:00:00.000Z", addedAt: "" });
Object.assign(b, { stars: 9e9, downloads: 7, easySetup: false, firstSeen: "2099-01-01T00:00:00.000Z", addedAt: "" });
b.facts = { ...(b.facts || {}), ai_use: "generated", features: { coop: "yes" } };
c.facts = { ...(c.facts || {}), ai_use: "none" };
const top = () => document.querySelector("#catalogList .gtile")?.dataset.card, n = () => visibleGames().list.length;
const sort = async (v) => { $("catSort").value = v; $("catSort").oninput(); await wait(200); return top(); };
out.popular = (await sort("popular")) === a.id; out.stars = (await sort("stars")) === b.id; out.newest = (await sort("newest")) === b.id;
out.all = n();
const tick = async (id) => { $(id).checked = true; $(id).oninput(); await wait(100); const r = visibleGames().list; $(id).checked = false; $(id).oninput(); return r; };
const easy = await tick("catEasy"); out.easy = easy.includes(a) && !easy.includes(b);
const multi = await tick("catMulti"); out.multi = multi.includes(b) && multi.every((g) => g.facts?.features?.coop || g.facts?.features?.online);
const noAI = await tick("catNoAI"); out.hideAI = !noAI.includes(b) && noAI.includes(c) && noAI.length < out.all;
out.aiStates = [aiState(b), aiState(c), aiState({})].join(",");
// Plays Great with no reports to go on says why, not just "Nothing matches".
reports.counts.byGame = {}; $("catRunsWell").checked = true; $("catRunsWell").oninput(); await wait(200);
out.playsGreatSaysWhy = /enough player reports/.test($("catalogList").textContent); $("catRunsWell").checked = false; $("catRunsWell").oninput(); await wait(200);
// Other names: a search for another language's title finds the game.
c.aka = ["Pokémon Edición Roja"]; $("catSearch").value = "pokemon roja"; $("catSearch").oninput(); await wait(200);
out.findsByOtherName = visibleGames().list.length === 1 && visibleGames().list[0] === c; $("catSearch").value = ""; $("catSearch").oninput(); await wait(200);
out.cover = getComputedStyle(document.querySelector("#catalogList .gtile .cover img") || document.body).objectFit;
const bp = $("bigPicture").getBoundingClientRect();
out.bigPicTopRight = bp.top < 40 && innerWidth - bp.right < 40 && bp.width > 0;
// Nothing of a screen's own sits under it. (The What's New box a fresh profile opens covers everything, as a dialog should.)
$("whatsNew").hidden = true;
out.bigPicClear = [...document.querySelectorAll("section.view")].every((v) => { showView(v.dataset.view); const r = $("bigPicture").getBoundingClientRect(), el = document.elementFromPoint(r.left + 4, r.top + 4); return el === $("bigPicture"); });
showView("settings"); $("bigPicture").click(); for (let i = 0; i < 30 && $("couch").hidden; i++) await wait(100); out.bigPicOpens = !$("couch").hidden; closeCouch();
// A game's page: the numbers at a glance, and More Like This as box-art tiles that open the game.
$("whatsNew").hidden = true; b.console = a.console; b.title = a.title + " Zz"; await showDetail(a); await wait(300);
out.statsRow = [...$("detailStats").children].map((d) => d.textContent).join(" / ");
out.statsOk = /Downloads9B/.test(out.statsRow) && /GitHub Stars5/.test(out.statsRow);
out.likeTiles = $("detailPorts").querySelectorAll(".gtile .cover").length > 0 && !$("detailPorts").querySelector(".srcRow");
const tile = $("detailPorts").querySelector(".gtile [data-portid]"), want = tile.dataset.portid; tile.click(); await wait(300);
out.likeOpens = detailGame?.id === want;
return { ok: Object.values(out).every((v) => v === true || typeof v !== "boolean") && out.cover === "contain" && out.aiStates === "assisted,none,unsaid", ...out };
