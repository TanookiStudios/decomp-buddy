#!/bin/zsh
# Kirby AI smoke: a stand-in for the site's question box on this computer. It asks for one catalog search, checks
# what the app found, then answers naming a game. Hidden window; the real site and the model are never reached.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/kirby; rm -rf $W; mkdir -p $W/profile
echo '{"sawLegal":true}' > $W/profile/settings.json
cat > $W/site.mjs <<'JS'
import http from "node:http"; import fs from "node:fs";
const dir = process.argv[2], got = [];
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (!req.url.startsWith("/api/decomp-ask")) { res.statusCode = 404; return res.end("{}"); }
    if (req.method === "GET") return res.end(JSON.stringify({ ok: true, ready: process.env.KIRBY_OFF ? false : true }));
    const { messages } = JSON.parse(body); got.push(messages); fs.writeFileSync(`${dir}/got.json`, JSON.stringify(got));
    const last = messages.at(-1);
    if (typeof last.content === "string" && /too many/.test(last.content)) return res.end(JSON.stringify({ ok: false, error: "too_many" }));
    if (typeof last.content === "string") return res.end(JSON.stringify({ ok: true, done: false, text: "", tools: [{ id: "t1", name: "search_games", input: { text: "ocarina", console: "Nintendo 64", limit: 3 } }], content: [{ type: "tool_use", id: "t1", name: "search_games", input: { text: "ocarina" } }] }));
    const found = JSON.parse(last.content[0].content).games || [];
    res.end(JSON.stringify({ ok: true, done: true, tools: [], text: found.length ? `Try ${found[0].title}. It plays start to finish.` : "I found nothing." }));
  });
}).listen(0, "127.0.0.1", function () { fs.writeFileSync(`${dir}/port`, String(this.address().port)); });
JS
node $W/site.mjs $W & SITE=$!; trap "kill $SITE 2>/dev/null" EXIT
for i in {1..50}; do [[ -s $W/port ]] && break; sleep 0.1; done
DECOMP_SUGGEST_BASE=http://127.0.0.1:$(cat $W/port) DECOMP_KIRBY_LIVE=1 SMOKE_SHOT=${SMOKE_SHOT:-} SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-90000} scripts/smoke.sh ${KIRBY_SCRIPT:-scripts/smoke/kirby.js} $W/profile
