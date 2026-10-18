#!/bin/zsh
# Kiosk Mode smoke: save a PIN, switch Kiosk Mode on (Couch Mode opens locked), try the window's
# close button, a wrong PIN three times, then the right one on a simulated controller. Hidden window,
# nothing is launched; the profile is thrown away.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/kiosk; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile; mkdir -p "$T/lib" "$T/xfer" $P
for n in Alpha Bravo; do
  G="$T/lib/$n - N64"; mkdir -p "$G/$n.app/Contents/MacOS"; head -c 20000 /dev/urandom > "$G/$n.app/Contents/MacOS/x"; chmod +x "$G/$n.app/Contents/MacOS/x"
  cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-01T00:00:00.000Z","lastPlayed":"2026-09-2${#n}T00:00:00.000Z","target":"macos-arm64","repo":"x/$n","repoUrl":"u","release":{"tag":"v1","url":"u","files":[]},"folder":"$n - N64","status":"ready","statusDetail":"","plan":{"game_title":"$n","console":"Nintendo 64","build":{"method":"release","executable":"$n.app"},"game_files":[],"notes":[]}}
JSON
done
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","sawLegal":true,"sawWhere":true,"countSetups":false,"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
cp scripts/smoke/kiosk.js $W/script.js
# The app quitting early (a close that wasn't held) prints no RESULT and exits 0: require the RESULT.
OUT=$(SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-90000} scripts/smoke.sh $W/script.js $P 2>&1 || true); print -r -- "$OUT" | grep -v '^    at \|^Error occurred in handler'
print -r -- "$OUT" | grep -q '^ "ok": true' || { echo "FAIL: no passing RESULT"; exit 1; }
# The PIN itself must never be written down - only its hash.
if grep -q 2580 $P/settings.json; then echo "FAIL: the PIN is in settings.json"; exit 1; fi
grep -q '"hash":"[0-9a-f]\{64\}"' $P/settings.json || { echo "FAIL: no PIN hash in settings.json"; exit 1; }
echo "settings.json holds a hash, not the PIN"
