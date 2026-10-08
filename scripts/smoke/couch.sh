#!/bin/zsh
# Couch Mode smoke: three fake games; keyboard and a simulated controller drive it. Hidden window
# (full screen is a no-op under the harness), nothing is launched.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/couch; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile; mkdir -p "$T/lib" "$T/xfer" $P
for n in Alpha Bravo Charlie; do
  G="$T/lib/$n - N64"; mkdir -p "$G/$n.app/Contents/MacOS"; head -c 20000 /dev/urandom > "$G/$n.app/Contents/MacOS/x"; chmod +x "$G/$n.app/Contents/MacOS/x"
  cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-01T00:00:00.000Z","lastPlayed":"2026-09-2${#n}T00:00:00.000Z","target":"macos-arm64","repo":"x/$n","repoUrl":"u","release":{"tag":"v1","url":"u","files":[]},"folder":"$n - N64","status":"ready","statusDetail":"","plan":{"game_title":"$n","console":"Nintendo 64","build":{"method":"release","executable":"$n.app"},"game_files":[],"notes":[]}}
JSON
done
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","sawLegal":true,"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
cp scripts/smoke/couch.js $W/script.js
SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-90000} scripts/smoke.sh $W/script.js $P
