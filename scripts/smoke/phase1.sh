#!/bin/zsh
# Phase 1 smoke: rename / tags / hide, desktop shortcut, Remove Game, news banner, interface size - all in a throwaway place.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/phase1; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile
mkdir -p "$T/lib/Ship Of Harkinian/soh.app/Contents/MacOS" "$T/lib/Spare Game" "$T/xfer" "$T/desktop" $P
head -c 20000 /dev/urandom > "$T/lib/Ship Of Harkinian/soh.app/Contents/MacOS/soh"; chmod +x "$T/lib/Ship Of Harkinian/soh.app/Contents/MacOS/soh"
for f in "Ship Of Harkinian:Ocarina Of Time:soh.app" "Spare Game:Spare Game:spare"; do
  IFS=: read d t x <<< "$f"
  echo "{\"decompBuddyVersion\":1,\"setUpAt\":\"2026-10-01T00:00:00.000Z\",\"target\":\"macos-arm64\",\"folder\":\"$d\",\"status\":\"ready\",\"plan\":{\"game_title\":\"$t\",\"console\":\"N64\",\"build\":{\"method\":\"release\",\"executable\":\"$x\"},\"game_files\":[]}}" > "$T/lib/$d/decomp-buddy.json"
done
cat > $W/news.json <<JSON
{"items":[{"id":"old","text":"Expired","until":"2020-01-01"},{"id":"n1","text":"Decomp Buddy now scans every download for malware.","url":"https://decompbuddy.com/"}]}
JSON
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","sawLegal":true,"sawWhere":true,"countSetups":false}
JSON
sed "s|__T__|$T|g" scripts/smoke/phase1.js > $W/script.js
DECOMP_DESKTOP=$T/desktop DECOMP_TRASH_DIR=$T/trash DECOMP_NEWS_FILE=$W/news.json SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-180000} scripts/smoke.sh $W/script.js $P
