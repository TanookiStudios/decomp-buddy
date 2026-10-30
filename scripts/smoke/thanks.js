// Play time + Thank The Developer: a game with 90 minutes played shows the thank-you once; Not Now hides it for good.
await refresh(); showView("library"); await renderLibrary(); await wait(1500);
const out = { shown: !$("thankBanner").hidden, text: $("thankBanner").textContent.replace(/\s+/g, " ").slice(0, 160), hero: $("continueHero").textContent.replace(/\s+/g, " ") };
out.buttons = [...$("thankBanner").querySelectorAll("button")].map((b) => b.textContent);
$("thankBanner").querySelector('[data-thx="later"]').click(); await wait(800);
await renderLibrary(); await wait(1200);
out.afterReload = !$("thankBanner").hidden;
return { ok: out.shown && /Alpha/.test(out.text) && /2 hours played/.test(out.text) && out.buttons.includes("Star It On GitHub") && /2 hours played/.test(out.hero) && !out.afterReload, ...out };
