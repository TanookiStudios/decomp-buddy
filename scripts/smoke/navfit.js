// Menu fit: every menu item on one line, in all six languages, with Admin showing (the widest case).
// Run: scripts/smoke.sh scripts/smoke/navfit.js <throwaway profile dir>
$("adminNav").hidden = false; $("adminSep").hidden = false; // Admin shows too, for the widest case
const check = (lang) => {
  const nav = document.querySelector("nav.side");
  const btns = [...nav.querySelectorAll("button")].filter((b) => !b.hidden);
  const lineH = parseFloat(getComputedStyle(btns[0]).lineHeight) || 20;
  const wrapped = btns.filter((b) => b.scrollWidth > b.clientWidth + 1 || b.clientHeight - 18 > lineH * 1.5).map((b) => b.textContent.trim());
  return { lang, navWidth: Math.round(nav.getBoundingClientRect().width), setup: nav.querySelector('[data-nav="setup"]').textContent.trim(), wrapped };
};
const navEl = document.querySelector("nav.side"), english = navEl.innerHTML;
const out = [check("en")];
for (const l of ["es", "pt-BR", "fr", "de", "ja"]) { navEl.innerHTML = english; $("adminNav").hidden = false; $("adminSep").hidden = false; await I18N.use(l); await wait(300); out.push(check(l)); }
return { ok: out.every((r) => !r.wrapped.length), windowWidth: innerWidth, out };
