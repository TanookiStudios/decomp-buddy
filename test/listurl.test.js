import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { makeSource, fromJson, dataUrlsIn } from "../src/sources/list-url.js";

const catalog = { schemaVersion: 1, apps: [
  { id: "a", name: "Auto-TMC (Zelda: The Minish Cap)", repository: "StonedModder/auto-tmc", sourceType: "github", projectUrl: "https://github.com/StonedModder/auto-tmc", sourcePlatform: "Game Boy Advance", platforms: ["Windows", "Linux", "Android"], appIconUrl: "https://cdn/x.png", latestKnownRelease: "1.0.2", externalLinks: [{ label: "Dep", url: "https://github.com/libsdl-org/SDL" }] },
  { id: "b", name: "Some Local Build", repository: "", projectUrl: "https://example.org/b/", sourcePlatform: "Xbox 360" },
  { id: "c", name: "Super Mario World", repository: "snesrev/smw", sourcePlatform: "SNES", platforms: ["Windows"] },
  { id: "d", name: "Old Thing", repository: "x/old", enabled: false },
  { id: "e", name: "Ape Escape", projectUrl: "https://github.com/Alexbeav/ape-escape-recomp", sourcePlatform: "PlayStation 1" },
] };

test("fromJson: one card per named entry, its own fields; dependency links and disabled entries ignored", () => {
  const g = fromJson(catalog, "list:x");
  assert.deepEqual(g.map((x) => x.id), ["github:stonedmodder/auto-tmc", "github:snesrev/smw", "github:alexbeav/ape-escape-recomp"]);
  assert.equal(g[0].title, "Auto-TMC (Zelda: The Minish Cap)"); assert.equal(g[0].console, "Game Boy Advance");
  assert.deepEqual(g[0].platforms, ["Windows", "Linux"]); assert.equal(g[0].version, "1.0.2"); assert.equal(g[0].iconUrl, "https://cdn/x.png");
  assert.equal(g[1].console, "SNES"); assert.equal(g[2].console, "PlayStation");
});

test("dataUrlsIn: same-host .json files a script references, resolved against the page", () => {
  const html = `<script>const CATALOG_URL = './catalog.json'; fetch(\`\${CATALOG_URL}?v=1\`); const x = "https://evil.example/other.json";</script>`;
  assert.deepEqual(dataUrlsIn(html, "https://gamewave.digital/ports/"), ["https://gamewave.digital/ports/catalog.json"]);
});

test("a page that draws its list with JavaScript is followed to its JSON file", async () => {
  const s = http.createServer((req, res) => {
    if (req.url === "/ports/") { res.setHeader("content-type", "text/html"); return res.end(`<html><body><div id="ports"></div><script>const CATALOG_URL='./catalog.json';fetch(CATALOG_URL)</script></body></html>`); }
    if (req.url === "/ports/catalog.json") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify(catalog)); }
    if (req.url === "/empty/") { res.setHeader("content-type", "text/html"); return res.end("<p>nothing</p>"); }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${s.address().port}`;
  try {
    const games = await makeSource(`${base}/ports/`).fetchSource();
    assert.equal(games.length, 3); assert.equal(games[1].title, "Super Mario World");
    await assert.rejects(makeSource(`${base}/empty/`).fetchSource(), /nor in any data file/);
  } finally { s.close(); }
});
