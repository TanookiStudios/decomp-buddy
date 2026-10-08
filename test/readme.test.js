import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, renderMarkdown, imagesIn } from "../src/readme.js";

test("sanitizer strips scripts, handlers and bad schemes; keeps tables, images, links", () => {
  const html = sanitize(`<p onclick="x()">hi <script>alert(1)</script><a href="javascript:evil()">j</a> <a href="docs/x.md">rel</a></p><table><tr><td>1</td></tr></table><img src="shots/a.png" onerror="x()"><iframe src="https://x"></iframe><style>body{}</style>`, { base: "https://github.com/o/r/blob/main/README.md" });
  assert.doesNotMatch(html, /script|onclick|onerror|javascript:|iframe|style/);
  assert.match(html, /<table><tr><td>1<\/td>/);
  assert.match(html, /<img src="https:\/\/raw\.githubusercontent\.com\/o\/r\/main\/shots\/a\.png" loading="lazy">/);
  assert.match(html, /<a href="https:\/\/github\.com\/o\/r\/blob\/main\/docs\/x\.md" data-ext="1">rel<\/a>/);
});

test("markdown renders and screenshots are collected (badges excluded)", () => {
  const md = "# Title\n\n![shot](shots/1.png) ![badge](https://img.shields.io/x.svg)\n\n- a\n- b";
  const html = renderMarkdown(md, { base: "https://github.com/o/r/blob/main/README.md" });
  assert.match(html, /<h1>Title<\/h1>/); assert.match(html, /<li>a<\/li>/);
  assert.deepEqual(imagesIn(md, { base: "https://github.com/o/r/blob/main/README.md" }), ["https://raw.githubusercontent.com/o/r/main/shots/1.png"]);
});
