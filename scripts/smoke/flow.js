const out = {}, T = "__T__", GAME = "github:xesf/ignition";
const until = async (fn, ms = 120000) => { for (let t = 0; t < ms; t += 250) { const v = fn(); if (v) return v; await wait(250); } return null; };
const shown = (el) => !!el && el.offsetParent !== null;
await refresh();
await loadCatalog({ refresh: false });
if (!catalog.games.find((g) => g.id === GAME)) return { ok: false, why: `${GAME} isn't in the catalog` };
// 1. Browse: pick it, press Download Selected Games.
showView("browse"); catSelected.add(GAME); renderCatalog();
out.button = $("catAdd").textContent;
$("catAdd").click();
// 2. Read straight away, with the stored steps, for this computer, on the screen without links / Build For / folder.
await until(() => games.length && !$("analyze").disabled);
const logText = $("log").textContent;
out.simple = $("setup-view").classList.contains("simple");
out.hidden = { links: !shown($("urls")), buildFor: !shown($("target")), goesInto: !shown($("outDir")), readRepos: !shown($("analyze")) };
out.heading = [...$("setup-view").querySelectorAll("h1")].filter(shown).map((h) => h.textContent);
out.stored = /Using the published install steps/.test(logText); out.readRepo = /Reading xesf\/ignition/i.test(logText);
out.status = $("status").textContent;
out.art = !!document.querySelector("#games .game .head img.art");
out.prepareLabel = [...$("setup").querySelectorAll("span")].filter(shown).map((s) => s.textContent).join("");
const g = games.find((x) => x.ok);
if (!g) return { ok: false, ...out, games, log: logText.slice(-800) };
// 3. Choose the game file (the file picker is a system dialog, so hand it the path the way Choose… does).
await usePick(g, 0, `${T}/mine/Ignition.cue`);
out.picked = (picks.get(g.id) || {})[0];
// 4. Prepare Games: a real download into this computer's Install Folder.
await $("setup").onclick();
await until(() => document.querySelector("#colOk [data-ready=play]"), 20000);
out.readyHeading = [...$("results").querySelectorAll("h1")].filter(shown).map((h) => h.textContent);
out.summary = $("resultsSummary").textContent;
out.readyButtons = [...document.querySelectorAll("#colOk .tacts button")].map((b) => b.textContent);
out.failed = $("colBad").textContent.trim();
const folder = document.querySelector("#colOk .tacts")?.dataset.folder || "";
out.inInstallFolder = folder.startsWith(`${T}/games/`);
out.play = await window.buddy.gamePlay(folder).then((r) => r.exe ? "launch (dry run)" : JSON.stringify(r)).catch((e) => e.message);
// 5. Installed Games: three buttons + More…, the extras only when More… is open.
showView("library"); await until(() => document.querySelector(".book .main3"), 15000);
const book = [...document.querySelectorAll(".shelf .book")].find((b) => b.querySelector(".title")?.textContent.includes("Ignition"));
out.tile = [...book.querySelectorAll(".main3 button")].map((b) => b.textContent);
out.extrasBefore = shown(book.querySelector(".acts"));
book.querySelector('.main3 [data-lib="extras"]').click(); await wait(300);
out.extrasAfter = shown(book.querySelector(".acts"));
// 6. Uninstall Game → are you sure → Move Rom Out Safely.
book.querySelector('.main3 [data-lib="uninstall"]').click(); await wait(200);
out.ask = shown($("uninstallAsk")) && $("uninstallTitle").textContent;
$("uninstallYes").click(); await wait(200);
out.romQuestion = shown($("uninstallRom")) && $("uninstallFiles").textContent;
$("libStatus").textContent = ""; $("uninstallMove").click();
await until(() => $("libStatus").textContent, 30000);
out.libStatus = $("libStatus").textContent;
out.libraryAfter = library.filter((x) => x.title.includes("Ignition")).length;
return { ok: out.simple && Object.values(out.hidden).every(Boolean) && out.stored && !out.readRepo && out.art && !!out.picked && out.inInstallFolder && out.readyButtons.includes("Go To Folder") && out.readyButtons.includes("Play Game")
  && out.tile.join("|") === "Play Game|Go To Folder|Uninstall Game|More…" && !out.extrasBefore && out.extrasAfter && !!out.romQuestion && out.libraryAfter === 0, folder, ...out };
