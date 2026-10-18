// Run: scripts/smoke/devices.sh
const out = {};
await refresh(); showView("devices"); await wait(3000);
out.quest = $("devQuestState").textContent; out.phone = $("devPhoneState").textContent; out.toolsHidden = $("devTools").hidden;
out.card = $("devCards").innerText.replace(/\s+/g, " ").trim();
// Install from the device card's Ready To Install list.
document.querySelector('#devCards [data-dev="install"]').click(); await wait(3000);
out.afterInstall = $("devState").textContent;
const list = await window.buddy.devicesList();
out.game = list.games[0];
// Reinstall on the same headset: its pushed folder is copied back into Saves Backup first.
document.querySelector('#devCards [data-dev="install"]').click(); await wait(3000);
out.afterReinstall = $("devState").textContent;
out.backups = await window.buddy.savesInfo(out.game.folder).catch((e) => ({ err: e.message }));
// Library: its own shelf, and Launch starts it on the headset.
showView("library"); await wait(2500);
out.shelf = [...document.querySelectorAll("#shelves .shelf-title")].map((x) => x.textContent);
const g = library.find((x) => x.onDevice);
out.launchEnabled = !document.querySelector(`.book[data-key="${CSS.escape(g.key)}"] [data-lib="play"]`).disabled;
document.querySelector(`.book[data-key="${CSS.escape(g.key)}"] [data-lib="play"]`).click(); await wait(2000);
out.launched = $("libStatus").textContent;
// Remove asks in the page first, then uninstall -k.
showView("devices"); await wait(2500);
document.querySelector('#devCards [data-dev="remove"]').click(); await wait(300);
out.confirm = $("devCards").innerText.includes("Its saves stay on the device");
document.querySelector('#devCards [data-dev="removeYes"]').click(); await wait(2500);
out.afterRemove = $("devState").textContent;
out.statusAfterRemove = (await window.buddy.devicesList()).games[0].status;
showView("library"); await wait(500);
return { ok: out.quest === "Ready" && out.toolsHidden && /Quest 3/.test(out.card) && /Ready To Install/.test(out.card) && /Installed, with 1 file/.test(out.afterInstall)
  && out.backups.backups?.length === 1 && /before-device-update/.test(out.backups.backups[0].name) && out.game.status === "on_device" && out.game.packageId === "com.drbeef.questzdoom" && /Installed/.test(out.afterReinstall)
  && out.shelf.includes("On Your Phones And Headsets") && out.launchEnabled && /Launched Doom on Quest 3/.test(out.launched)
  && out.confirm && /Removed/.test(out.afterRemove) && out.statusAfterRemove === "staged", ...out };
