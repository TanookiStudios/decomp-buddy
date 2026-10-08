const out = {};
await refresh(); showView("library"); await wait(1500);
const g = library[0]; await openMods(g); await wait(800);
out.items = [...$("modsList").querySelectorAll(".srcRow .lab")].map((x) => x.textContent);
out.orderShown = !!$("modsApplyOrder");
orderDraft = ["B Pack.o2r", "A Pack.o2r"]; await $("modsOrder").onclick({ target: $("modsApplyOrder"), });
await wait(500); out.afterOrder = (await window.buddy.modsList(g.folder)).items.map((i) => `${i.order}:${i.name}`);
await $("modsConflictBtn").onclick(); out.conflicts = $("modsConflicts").textContent.replace(/\s+/g, " ").trim();
$("modsGbBtn").click(); await wait(6000);
out.gbHeader = $("modsGb").querySelector("h4")?.textContent;
out.gbCount = $("modsGb").querySelectorAll(".gbmod").length;
// the smallest downloadable file among the first mods
let best = null;
for (const b of [...$("modsGb").querySelectorAll("[data-gbmod]")].slice(0, 8)) {
  const m = await window.buddy.gbMod(Number(b.dataset.gbmod));
  for (const f of m.files) if (f.clean !== false && f.size && (!best || f.size < best.f.size)) best = { m, f };
}
out.picked = best && { mod: best.m.name, by: best.m.author, file: best.f.name, size: best.f.size, md5: !!best.f.md5 };
out.install = best ? await window.buddy.gbInstall(g.folder, best.m.id, best.f.id).catch((e) => ({ error: e.message })) : "none";
out.itemsAfter = (await window.buddy.modsList(g.folder)).items.map((i) => i.name);
out.updates = await window.buddy.modsUpdates();
return { ok: out.gbCount > 0 && !!out.install?.file && /B Pack/.test(out.afterOrder[0]) && /change 1 file/.test(out.conflicts), ...out };
