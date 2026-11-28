// Accent color: after picking blue in Make It Yours, nothing the app draws may still be the default pink.
// Run: scripts/smoke.sh scripts/smoke/accent.js <throwaway profile>
await refresh(); await wait(1500);
settings.look = { ...(settings.look || {}), accent: "#3478f6" }; await applyLook(); await wait(300);
const PINK = /rgb\(255, 107, 157\)|rgb\(194, 69, 122\)|rgb\(255, 184, 207\)|rgb\(249, 208, 222\)/;
const out = { views: {} };
for (const v of [...document.querySelectorAll("main > section.view")].map((s) => s.dataset.view)) {
  showView(v); await wait(250);
  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!el.offsetParent && el.tagName !== "BODY") continue;
    const cs = getComputedStyle(el);
    for (const p of ["backgroundColor", "color", "borderTopColor", "outlineColor", "fill"]) if (PINK.test(cs[p])) { bad.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""} ${p}`); break; }
  }
  if (bad.length) out.views[v] = { count: bad.length, sample: [...new Set(bad)].slice(0, 8) };
}
out.accentVar = getComputedStyle(document.body).getPropertyValue("--accent");
return { ok: !Object.keys(out.views).length, ...out };
