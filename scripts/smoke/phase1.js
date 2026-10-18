// Run: scripts/smoke/phase1.sh
const out = {};
await refresh(); showView("library"); await wait(2500);
const soh = library.find((g) => g.originalTitle === "Ocarina Of Time"), spare = library.find((g) => g.originalTitle === "Spare Game");
await openMore(soh); await wait(800);
$("moreName").value = "Zelda OoT"; $("moreTags").value = "Favorites, N64, favorites, "; $("moreHidden").checked = false;
await $("moreUserSave").onclick(); await wait(800);
const soh2 = library.find((g) => g.originalTitle === "Ocarina Of Time");
out.renamed = soh2.title; out.tags = soh2.tags;
await window.buddy.gameSetUser(spare.folder, { hidden: true }); await renderLibrary(); await wait(500);
out.tagBar = [...document.querySelectorAll("#libTags [data-tag]")].map((b) => b.textContent);
out.hiddenShown = document.querySelector("#shelves").innerText.includes("Spare Game");
document.querySelector('#libTags [data-tag="N64"]').click(); await wait(800);
out.filteredTitle = document.querySelector("#shelves .shelf-title")?.textContent;
document.querySelector('#libTags [data-tag=""]').click(); await wait(500);
$("libShowHidden").click(); await wait(800);
out.hiddenShownAfter = document.querySelector("#shelves").innerText.includes("Spare Game");
// Desktop shortcut into the throwaway desktop.
await openMore(library.find((g) => g.originalTitle === "Ocarina Of Time")); await wait(500);
await $("moreShortcut").onclick(); await wait(500);
out.shortcutMsg = $("gamePanelState").textContent;
// Remove: two presses, then gone from the list and in the throwaway trash.
await openMore(library.find((g) => g.originalTitle === "Spare Game")); await wait(500);
$("moreRemove").click(); out.confirmShown = !$("moreRemoveYes").hidden;
await $("moreRemoveYes").onclick(); await wait(1200);
out.afterRemove = library.map((g) => g.originalTitle);
out.removeMsg = $("libStatus").textContent;
// News banner from news.json (expired item skipped), then dismissed for good.
await showNews(); out.news = $("newsBar").hidden ? null : $("newsText").textContent;
await $("newsClose").onclick(); await showNews(); out.newsAfterDismiss = !$("newsBar").hidden;
// Interface size.
await window.buddy.setSettings({ uiScale: 1.3 }); await wait(300); const s = await window.buddy.getSettings(); out.uiScale = s.uiScale;
return { ok: out.renamed === "Zelda OoT" && JSON.stringify(out.tags) === '["Favorites","N64"]' && !out.hiddenShown && out.hiddenShownAfter && /N64/.test(out.filteredTitle || "")
  && /Shortcut added/.test(out.shortcutMsg) && out.confirmShown && !out.afterRemove.includes("Spare Game") && out.news === "Decomp Buddy now scans every download for malware." && !out.newsAfterDismiss && out.uiScale === 1.3, ...out };
