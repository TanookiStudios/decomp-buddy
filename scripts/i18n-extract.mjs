#!/usr/bin/env node
// Collect every user-visible English string from the renderer into renderer/i18n/en.json.
// Static HTML: text nodes and placeholder / aria-label / title / alt. app.js: the text parts of
// string and template literals (HTML tags split off, ${...} becomes {0}, {1}...). English stays the
// source of truth; other languages map these exact strings.
import fs from "node:fs";
import * as acorn from "acorn";
import * as walk from "acorn-walk";

const out = new Set();
const keep = (s) => {
  s = s.replace(/\s+/g, " ").trim();
  if (!s || s.length < 2 || !/[A-Za-z]{2}/.test(s)) return;
  if (/^[#.\[]|^--|^[a-z][a-zA-Z0-9-]*$|^[a-z]+:[a-z]|https?:|\.(js|json|png|html|css)\b|^\{\d\}$|=>|&&|\|\||^[A-Z_]+$|^[a-z]+(-[a-z]+)+$|^[\w-]+\/[\w-]+$|^\$|;$/.test(s)) return;
  if (/^[^A-Za-z]*\{\d\}[^A-Za-z]*$/.test(s)) return;
  out.add(s);
};
const html = fs.readFileSync("renderer/index.html", "utf8").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>/g, "");
for (const m of html.matchAll(/>([^<>]+)</g)) keep(m[1].replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&rarr;/g, "→"));
for (const m of html.matchAll(/\b(?:placeholder|aria-label|title|alt)="([^"]+)"/g)) keep(m[1]);

// app.js: parse it properly and take string literals and the text parts of template literals.
// Every renderer script except the translator itself.
for (const f of fs.readdirSync("renderer").filter((n) => n.endsWith(".js") && n !== "i18n.js").sort()) {
const js = fs.readFileSync(`renderer/${f}`, "utf8");
const ast = acorn.parse(js, { ecmaVersion: "latest", sourceType: "script" });
const addText = (text) => { for (const chunk of text.split(/<[^>]*>/)) { if (/class=|data-|aria-|=\s*"|\bid=|style=/.test(chunk)) continue; let n = 0; keep(chunk.replace(/\u0000\d+\u0000/g, () => `{${n++}}`).replace(/&amp;/g, "&")); } };
walk.full(ast, (node, _st, type) => {
  if (type === "Literal" && typeof node.value === "string") addText(node.value);
  if (type === "TemplateLiteral") addText(node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? `\u0000${i}\u0000` : "")).join(""));
});
}
const list = [...out].sort();
fs.writeFileSync("renderer/i18n/en.json", JSON.stringify({ _meta: { language: "English", source: true, strings: list.length }, strings: Object.fromEntries(list.map((s) => [s, s])) }, null, 1));
console.log(`${list.length} strings`);
