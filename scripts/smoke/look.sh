#!/bin/zsh
# Make It Yours smoke: accent color, Library Layout and Card Size, a background picture and music
# (seeded into the throwaway profile's theme folder - the file dialog can't run hidden), and Reset.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/look; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile; mkdir -p "$T/lib" "$T/xfer" $P/theme
for n in Alpha Bravo; do
  G="$T/lib/$n - N64"; mkdir -p "$G/$n.app/Contents/MacOS"; head -c 20000 /dev/urandom > "$G/$n.app/Contents/MacOS/x"; chmod +x "$G/$n.app/Contents/MacOS/x"
  cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-01T00:00:00.000Z","target":"macos-arm64","repo":"x/$n","repoUrl":"u","release":{"tag":"v1","url":"u","files":[]},"folder":"$n - N64","status":"ready","statusDetail":"","plan":{"game_title":"$n","console":"Nintendo 64","build":{"method":"release","executable":"$n.app"},"game_files":[],"notes":[]}}
JSON
done
# A 1x1 PNG and a few bytes standing in for music (only its blob: URL is checked, it never plays).
print -n 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' | base64 -D > $P/theme/image-1.png
head -c 2000 /dev/urandom > $P/theme/music-1.mp3
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","sawLegal":true,"sawWhere":true,"countSetups":false,"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100],"look":{"bgImage":"image-1.png","bgDim":0.5,"music":"music-1.mp3"}}
JSON
cp scripts/smoke/look.js $W/script.js
OUT=$(SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-90000} scripts/smoke.sh $W/script.js $P 2>&1 || true); print -r -- "$OUT"
print -r -- "$OUT" | grep -q '^ "ok": true' || { echo "FAIL: no passing RESULT"; exit 1; }
# Reset Appearance deletes the copied picture and music.
[[ -z "$(ls $P/theme)" ]] || { echo "FAIL: theme folder not emptied: $(ls $P/theme)"; exit 1; }
echo "theme folder emptied by Reset Appearance"
