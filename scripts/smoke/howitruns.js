// How It Runs: the ask card after a play session (once per game per version), what goes with a report, Don't Ask
// Again, and the card on a game's page. Run with scripts/smoke/howitruns.sh (it stands in for the website).
const out = {};
// The card closes itself a moment after the report is in: wait for that, however long the send takes.
const sent = async () => { for (let i = 0; i < 60 && !$("ranAsk").hidden; i++) await wait(250); };
await refresh(); await loadCatalog({ refresh: false }); await wait(1500); $("whatsNew").hidden = true;
library = await window.buddy.libraryList(); const lib = library[0], cat = catalogOf(lib);
out.inCatalog = !!cat;
await gamePlayed({ folder: lib.folder });
out.asks = !$("ranAsk").hidden && /Ocarina of Time/.test($("ranAsk").textContent);
out.sendWaitsForAnAnswer = $("ranSend").disabled;
out.computerShown = $("ranPcLine").textContent; out.showsComputer = /GB/.test(out.computerShown) && $("ranPc").checked;
$("ranAsk").querySelector('[data-ran="runs"]').click(); out.whyHiddenWhenGreat = $("ranWhy").hidden;
$("ranNote").value = "Smooth all the way."; $("ranSend").click(); await sent();
out.closesAfterSend = $("ranAsk").hidden;
await gamePlayed({ folder: lib.folder }); out.asksOncePerVersion = $("ranAsk").hidden;
// From More…: a problem, without the computer.
await askHowItRan(lib, { preset: "issues" }); out.whyShownForProblems = !$("ranWhy").hidden && !$("ranNever");
$("ranReason").value = "sound"; $("ranPc").checked = false; $("ranNote").value = ""; $("ranSend").click(); await sent();
// Don't Ask Again.
reports.mine = {}; await gamePlayed({ folder: lib.folder }); $("ranNever").click(); await wait(300);
reports.mine = {}; await gamePlayed({ folder: lib.folder }); out.dontAskAgain = $("ranAsk").hidden && settings.askAfterPlay === false && !$("askAfterPlay").checked;
// The game's page.
await showDetail(cat); const box = $("detailRuns"); for (let i = 0; i < 60 && !box.querySelector(".rbig"); i++) await wait(250);   // the page loads other things first on a slow connection
out.card = box.querySelector(".rbig")?.textContent.replace(/\s+/g, " ").trim();
out.cardOk = /^71% All Versions · Plays Great/.test(out.card) && box.querySelectorAll(".rlist li").length === 3;
out.noCountsYet = !/7 Reports/.test(box.textContent) && !box.querySelector(".rcounts b") && !/\d Reports/.test(box.textContent);   // numbers wait until a game has plenty
out.rightDay = /Nov 1, 2026/.test(box.textContent) && /More Reports/.test(box.textContent);   // a bare date must not slip to the day before
out.hardwareLine = /i7-12700H · RTX 3050 Laptop GPU \(driver 32.0.15.9649\) · 24 GB/.test(box.textContent) && /Not even a slight problem/.test(box.textContent) && /today/.test(box.textContent);
box.querySelector('[data-runs="only"]').click(); out.thisVersion = /^100% This Version \(9.3.1\)/.test(box.querySelector(".rbig").textContent.replace(/\s+/g, " ").trim());
box.querySelector('[data-runs="all"]').click(); box.querySelector('[data-runs="open"]').click(); out.allReports = box.querySelectorAll(".rlist li").length === 5 && !box.querySelector('[data-runs="open"]');
// No reports: the bar starts as even thirds, with no numbers and no score; one report moves it; three or more is what players said.
const card = (all, v) => { const e = document.createElement("div"); e.innerHTML = howItRunsHtml({ all, tags: {}, recent: [] }, v); return e; }, flex = (e) => [...e.querySelectorAll(".rbar span")].map((x) => +x.style.flexGrow || +x.style.flex.split(" ")[0]);
const none = card([0, 0, 0], "9.3.1");
out.startsAsThirds = JSON.stringify(flex(none)) === "[1,1,1]" && !/%/.test(none.textContent) && !/\d/.test(none.querySelector(".rcounts").textContent) && !/No Reports/.test(none.textContent) && /Played it\?/.test(none.textContent);
out.oneReportMovesIt = JSON.stringify(flex(card([1, 0, 0]))) === "[2,1,1]";
out.thenRealNumbers = JSON.stringify(flex(card([3, 0, 0]))) === "[3]" && /100%/.test(card([3, 0, 0]).textContent);
out.countsWhenPopular = /30 Reports/.test(card([28, 1, 1]).textContent) && card([28, 1, 1]).querySelectorAll(".rcounts b").length === 3;
// How To Set Up, from the published install steps; the AI card only when the project says AI helped.
for (let i = 0; i < 40 && !/How To Set Up/.test($("detailSetup").textContent); i++) await wait(250);
out.setupCard = /How To Set Up/.test($("detailSetup").textContent) && /You Bring/.test($("detailSetup").textContent) && $("detailSetup").querySelectorAll("ol li").length > 0;
out.noAiCardWhenUnsaid = !/AI-Assisted/.test($("detailSetup").textContent);
const aiGame = catalog.games.find((x) => aiState(x) === "assisted"); await showDetail(aiGame); await wait(600);
out.aiCard = /AI-Assisted/.test($("detailSetup").textContent) && /AI tools helped/.test($("detailSetup").textContent);
return { ok: Object.entries(out).every(([k, v]) => typeof v !== "boolean" || v), ...out };
