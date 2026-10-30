// Find My Steam And GOG Games: with a (fake) Steam library holding Fallout 2, reading fallout2-ce fills its data files
// in by themselves, labeled as copied from your games. Run by scripts/smoke/stores.sh (fake HOME, nothing launched).
const out = {};
await refresh(); await wait(500);
showView("setup"); $("urls").value = "https://github.com/alexbatalov/fallout2-ce"; $("analyze").click();
for (let i = 0; i < 120 && !document.querySelector("#games .file"); i++) await wait(500);
for (let i = 0; i < 20 && ![...document.querySelectorAll("#games .verify")].some((v) => /games on this computer/.test(v.textContent)); i++) await wait(500);
out.rows = [...document.querySelectorAll("#games .file")].map((f) => ({ label: f.querySelector("strong")?.textContent.slice(0, 40), chosen: f.querySelector(".chosen")?.textContent, note: [...f.querySelectorAll(".verify")].map((v) => v.textContent).join(" | ").slice(0, 160) }));
const filled = out.rows.filter((r) => /games on this computer \(Steam/.test(r.note));
return { ok: filled.length === out.rows.length && filled.filter((r) => /\.dat$/i.test(r.chosen)).length === 3 && filled.every((r) => /copied, never moved/.test(r.note)), filled: filled.length, ...out };
