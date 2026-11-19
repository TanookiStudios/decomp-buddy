#!/bin/zsh
# How It Runs smoke: one fake installed game that's in the catalog, and a stand-in for the website on this computer
# that records what the app sends and answers with a known set of reports. Hidden window, nothing is launched.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/howitruns; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile; mkdir -p "$T/lib" "$T/xfer" $P
G="$T/lib/Zelda - N64"; mkdir -p "$G/Zelda.app/Contents/MacOS"; head -c 20000 /dev/urandom > "$G/Zelda.app/Contents/MacOS/x"; chmod +x "$G/Zelda.app/Contents/MacOS/x"
cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-01T00:00:00.000Z","lastPlayed":"2026-09-21T00:00:00.000Z","target":"macos-arm64","repo":"HarbourMasters/Shipwright","repoUrl":"u","release":{"tag":"9.3.1","url":"u","files":[]},"folder":"Zelda - N64","status":"ready","statusDetail":"","plan":{"game_title":"The Legend of Zelda: Ocarina of Time","console":"Nintendo 64","build":{"method":"release","executable":"Zelda.app"},"game_files":[],"notes":[]}}
JSON
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","sawLegal":true,"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
cat > $W/site.mjs <<'JS'
import http from "node:http"; import fs from "node:fs";
const dir = process.argv[2], got = [];
const answer = { ok: true, all: [5, 1, 1], tags: { "9.3.1": [3, 0, 0], "9.2.2": [2, 1, 1] }, recent: [
  { verdict: "runs", tag: "9.3.1", day: new Date().toISOString().slice(0, 10), sys: "windows-x64", os: "Windows 11 Pro (22631)", cpu: "Intel Core i7-12700H", gpu: "RTX 3050 Laptop GPU (driver 32.0.15.9649)", ram: 24, note: "Not even a slight problem." },
  { verdict: "runs", tag: "9.3.1", day: "2026-11-01", sys: "macos-arm64" }, { verdict: "runs", tag: "9.3.1", day: "2026-10-30", sys: "deck" },
  { verdict: "issues", tag: "9.2.2", day: "2026-10-02", sys: "linux-x64", os: "Fedora Linux 41", cpu: "AMD Ryzen 5 5600", gpu: "Radeon RX 6600", ram: 16, note: "Sound crackles in menus." },
  { verdict: "no", tag: "9.2.2", day: "2026-09-30", sys: "windows-x64" }] };
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/api/decomp-report") { got.push(JSON.parse(body)); fs.writeFileSync(`${dir}/got.json`, JSON.stringify(got)); return res.end(JSON.stringify({ ok: true, counts: [1, 0, 0] })); }
    if (req.url.startsWith("/api/decomp-reports?game=")) return res.end(JSON.stringify({ ...answer, game: decodeURIComponent(req.url.split("=")[1]) }));
    if (req.url.startsWith("/api/decomp-reports")) return res.end(JSON.stringify({ ok: true, counts: {}, broken: {} }));
    res.statusCode = 404; res.end("{}");
  });
}).listen(0, "127.0.0.1", function () { fs.writeFileSync(`${dir}/port`, String(this.address().port)); });
JS
node $W/site.mjs $W & SITE=$!; trap "kill $SITE 2>/dev/null" EXIT
for i in {1..50}; do [[ -s $W/port ]] && break; sleep 0.1; done
cp ${HIR_SCRIPT:-scripts/smoke/howitruns.js} $W/script.js
DECOMP_SUGGEST_BASE=http://127.0.0.1:$(cat $W/port) DECOMP_REPORTS_LIVE=1 SMOKE_SHOT=${SMOKE_SHOT:-} SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-90000} scripts/smoke.sh $W/script.js $P
echo "SENT $(cat $W/got.json 2>/dev/null)"
