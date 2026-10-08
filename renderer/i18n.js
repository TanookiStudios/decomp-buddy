// Runtime translation. English in the markup and code is the source; for another language, every
// text node and label attribute that exactly matches an English string (or a "{0} of {1}"-style
// pattern) is swapped as it appears. Anything inside translate="no" - game titles, paths, the log -
// is never touched. Machine translations; fixes welcome on GitHub.
(() => {
  const ATTRS = ["placeholder", "aria-label", "title", "alt"];
  let dict = null, patterns = [];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const skip = (el) => el && el.closest && el.closest('[translate="no"], #log, code, pre, textarea, input[type=text], .readme, .relnotes');
  function tr(s) {
    if (!dict || !s) return s;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], core = s.trim();
    if (!core) return s;
    if (dict[core]) return lead + dict[core] + trail;
    for (const p of patterns) { const m = core.match(p.re); if (m) return lead + p.to.replace(/\{(\d)\}/g, (_, i) => m[Number(i) + 1] ?? "") + trail; }
    return s;
  }
  function walk(root) {
    if (!dict) return;
    const nodes = root.nodeType === 3 ? [root] : [];
    if (root.nodeType === 1) {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) nodes.push(n);
      for (const el of [root, ...root.querySelectorAll("[placeholder],[aria-label],[title],[alt]")]) if (!skip(el)) for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }
    }
    for (const n of nodes) { if (skip(n.parentElement)) continue; const t = tr(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; }
  }
  const obs = new MutationObserver((muts) => { for (const m of muts) { if (m.type === "characterData") walk(m.target); else for (const n of m.addedNodes) walk(n); if (m.type === "attributes" && !skip(m.target)) { const v = m.target.getAttribute(m.attributeName); const t = tr(v); if (t !== v) m.target.setAttribute(m.attributeName, t); } } });
  const realConfirm = window.confirm.bind(window);
  window.confirm = (m) => realConfirm(tr(m));
  window.I18N = {
    tr: (s) => tr(s),
    async use(code) {
      obs.disconnect();
      const data = code && code !== "en" ? await window.buddy.i18n(code).catch(() => null) : null;
      if (!data?.strings) { if (dict) location.reload(); return "en"; } // back to English: re-render from source
      dict = data.strings;
      patterns = Object.entries(dict).filter(([k]) => /\{\d\}/.test(k) && k.replace(/\{\d\}/g, "").replace(/[^A-Za-z]/g, "").length >= 6)
        .map(([k, v]) => ({ re: new RegExp(`^${esc(k).replace(/\\\{(\d)\\\}/g, "(.+?)")}$`), to: v }));
      document.documentElement.lang = code;
      walk(document.body);
      obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      return code;
    },
  };
})();
