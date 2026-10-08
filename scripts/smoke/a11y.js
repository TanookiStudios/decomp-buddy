// Every button, input, select and textarea on every screen (and in the new panels) has a name a
// screen reader can read. Prints the ones that don't; ok only when there are none.
const nameOf = (el) => (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent) || el.closest("label")?.textContent || (el.tagName === "BUTTON" ? el.textContent : "") || el.getAttribute("title") || el.getAttribute("placeholder") || "").trim();
const bad = new Set();
const sweep = (where) => { for (const el of document.querySelectorAll("button, input:not([type=hidden]), select, textarea")) { if (el.closest("[hidden]") && !el.closest("#couch")) continue; if (!nameOf(el)) bad.add(`${where}: <${el.tagName.toLowerCase()} id="${el.id}" class="${el.className}" ${Object.keys(el.dataset).map((k) => `data-${k}`).join(" ")}>`); } };
const steps = [];
const within = (p, ms, what) => { let t; return Promise.race([p, new Promise((r) => (t = setTimeout(() => { steps.push(`${what}: still waiting after ${ms} ms (network)`); r(); }, ms)))]).finally(() => clearTimeout(t)); };
await refresh();
for (const v of ["browse", "new", "foryou", "library", "setup", "settings", "about"]) { showView(v); await wait(v === "browse" ? 2500 : 700); sweep(v); steps.push(v); }
showView("library"); await wait(800);
if (library[0]) { await within(openMore(library[0]), 8000, "more"); await wait(800); sweep("more"); await within(openMods(library[0]), 8000, "mods"); await wait(500); sweep("mods"); steps.push("panels"); }
$("libPack").click(); await wait(300); sweep("pack");
const g = catalog.games[0]; if (g) { await within(showDetail(g), 8000, "detail"); await wait(1500); sweep("detail"); steps.push("detail"); }
showView("library"); $("libCouch").click(); await wait(500); sweep("couch"); closeCouch();
return { ok: bad.size === 0, unnamed: [...bad], steps };
