// Render a repo README (or release notes) to HTML we're willing to put in the app:
// marked for Markdown, then a strict allowlist so nothing from the internet can run.

import { marked } from "marked";

const ALLOWED = { p: [], br: [], h1: [], h2: [], h3: [], h4: [], h5: [], h6: [], ul: [], ol: ["start"], li: [], strong: [], b: [], em: [], i: [], code: [], pre: [], blockquote: [], hr: [], table: [], thead: [], tbody: [], tr: [], th: [], td: [], del: [], sup: [], sub: [], a: ["href"], img: ["src", "alt"], details: [], summary: [], kbd: [], span: [] };

// Tiny tolerant HTML walker: keeps allowed tags/attributes, drops everything else (contents kept).
export function sanitize(html, { base } = {}) {
  const abs = (u, isImg) => {
    try {
      const url = new URL(u, base || "https://github.com/");
      if (!/^https?:$/.test(url.protocol)) return null;
      if (isImg && base && url.hostname === "github.com" && /\/blob\//.test(url.pathname)) return url.href.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
      return url.href;
    } catch { return null; }
  };
  let out = "";
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|<!--[\s\S]*?-->|[^<]+|</g;
  let m;
  while ((m = tagRe.exec(html))) {
    const [tok, name, attrs] = m;
    if (tok.startsWith("<!--")) continue;
    if (!name) { out += tok.replace(/</g, "&lt;"); continue; }
    const tag = name.toLowerCase();
    if (!(tag in ALLOWED)) { if (/^(script|style|iframe|object|embed|svg|math)$/.test(tag)) { const close = new RegExp(`</${tag}\\s*>`, "i"); const rest = html.slice(tagRe.lastIndex); const cm = close.exec(rest); if (cm) tagRe.lastIndex += cm.index + cm[0].length; } continue; }
    if (tok.startsWith("</")) { out += `</${tag}>`; continue; }
    const keep = [];
    for (const am of attrs.matchAll(/([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      const an = am[1].toLowerCase(), av = am[3] ?? am[4] ?? am[5] ?? "";
      if (!ALLOWED[tag].includes(an)) continue;
      if (an === "href" || an === "src") { const u = abs(av, an === "src"); if (!u) continue; keep.push(`${an}="${u.replace(/"/g, "&quot;")}"`); }
      else keep.push(`${an}="${av.replace(/"/g, "&quot;")}"`);
    }
    if (tag === "a") keep.push('data-ext="1"');
    if (tag === "img") keep.push('loading="lazy"');
    out += `<${tag}${keep.length ? " " + keep.join(" ") : ""}>`;
  }
  return out;
}

export function renderMarkdown(md, { base } = {}) {
  return sanitize(marked.parse(String(md || ""), { async: false, gfm: true }), { base });
}

// Images the README shows (absolute URLs), for a screenshot strip.
export function imagesIn(md, { base } = {}) {
  const html = renderMarkdown(md, { base });
  return [...html.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/shields\.io|badge|\.svg(\?|$)/i.test(u));
}
