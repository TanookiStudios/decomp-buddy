// Tell Me When It's Playable: Notify Me on a Coming Soon game is remembered; a watched project that's in the catalog
// lands in Now Playable (badge on the menu), and Set It Up opens its page.
// Run: GITHUB_TOKEN=... SMOKE_TIMEOUT=300000 scripts/smoke.sh scripts/smoke/watch.js <profile whose settings.watch holds
// github:openrsg/gunzrs> - a fresh profile builds the whole catalog first, which takes a minute or two.
const out = {};
await refresh(); await wait(500);
document.querySelector('[data-nav="soon"]').click(); await wait(3000);
const bell = $("soonList").querySelector("[data-watch]"); out.bellKey = bell?.dataset.watch;
bell.click(); await wait(600);
out.pressed = $("soonList").querySelector(`[data-watch="${CSS.escape(out.bellKey)}"]`)?.getAttribute("aria-pressed");
out.saved = (await window.buddy.watchGet()).watching.includes(out.bellKey);
const hits = await window.buddy.watchCheck(); await wait(800);
out.hits = hits.map((h) => h.title);
out.badge = !$("soonBadge").hidden && $("soonBadge").textContent;
out.shelf = [...$("nowPlayableList").querySelectorAll(".lab")].map((x) => x.textContent);
out.stillWatchingGunz = (await window.buddy.watchGet()).watching.includes("github:openrsg/gunzrs");
$("nowPlayableList").querySelector("[data-ready]").click(); for (let i = 0; i < 40 && document.querySelector("main > section.view.active").dataset.view !== "detail"; i++) await wait(500);
out.view = document.querySelector("main > section.view.active").dataset.view; out.detail = $("detailTitle").textContent;
return { ok: out.pressed === "true" && out.saved && out.hits.length === 1 && out.badge === "1" && out.shelf.length === 1 && !out.stillWatchingGunz && out.view === "detail" && /GunZ/.test(out.detail), ...out };
