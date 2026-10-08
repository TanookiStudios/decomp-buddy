#!/bin/zsh
# Phase B smoke: fake Library in a throwaway place, then the hidden app drives it.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/library; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile
G="$T/lib/Street Fighter III - Arcade"
mkdir -p "$G/3sx.app/Contents/MacOS" "$G/data/saves/slot1" "$G/data/saves/slot2" "$T/xfer" "$T/cloud" "$T/lib/My Ship" $P
echo bin > "$G/game.bin"; echo mac1 > "$G/data/saves/slot1/save.bin"; echo mac2 > "$G/data/saves/slot2/save.bin"
head -c 20000 /dev/urandom > "$G/3sx.app/Contents/MacOS/3sx"; chmod +x "$G/3sx.app/Contents/MacOS/3sx"
cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-20T00:00:00.000Z","lastPlayed":"2026-09-28T20:00:00.000Z","target":"macos-arm64","repo":"guimaraf/3sxw","repoUrl":"https://github.com/guimaraf/3sxw","release":{"tag":"v0.1","url":"u","files":["game.bin","gone.dll"]},"folder":"Street Fighter III - Arcade","status":"ready","statusDetail":"","plan":{"game_title":"Street Fighter III: 3rd Strike","console":"Arcade","build":{"method":"release","executable":"3sx.app"},"game_files":[],"notes":[]}}
JSON
head -c 300000 /dev/urandom > "$T/lib/My Ship/soh.exe"
cp ~/Library/Application\ Support/decomp-buddy/catalog.json $P/ 2>/dev/null || true  # public catalog cache, read-only copy: no GitHub calls
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","syncDir":"$T/cloud","sawLegal":true,"setupCount":0,"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
node scripts/smoke/seed-sync.mjs "$T/cloud" guimaraf/3sxw "Street Fighter III: 3rd Strike" >/dev/null
sed "s|__T__|$T|g" scripts/smoke/library.js > $W/script.js
SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-180000} scripts/smoke.sh $W/script.js $P
