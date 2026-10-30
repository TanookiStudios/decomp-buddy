#!/bin/zsh
# Install Doctor smoke (Mac): a fake installed game whose program can't run, carries Apple's "from the internet" flag,
# and left a graphics error in its launch log. Hidden window, throwaway folders, nothing is launched.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/doctor; rm -rf $W; mkdir -p $W/lib $W/xfer $W/p
G="$W/lib/Broken - N64"; mkdir -p "$G"
printf '#!/bin/sh\necho hi\n' > "$G/broken"; chmod 644 "$G/broken"
xattr -w com.apple.quarantine "0081;00000000;Safari;" "$G/broken"
printf 'Decomp Buddy started broken\nLoading %s/Games/broken/baserom.z64\n[error] vkCreateInstance failed: VK_ERROR_INCOMPATIBLE_DRIVER\n' "$HOME" > "$G/decomp-buddy-launch.log"
cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-01T00:00:00.000Z","target":"macos-arm64","repo":"x/broken","repoUrl":"https://github.com/x/broken","release":{"tag":"v1","url":"u","files":[]},"folder":"Broken - N64","status":"ready","statusDetail":"","plan":{"game_title":"Broken","console":"Nintendo 64","build":{"method":"release","executable":"broken","scanned":{"sha256":"abc","engine":"ClamAV","at":"2026-10-28T00:00:00Z"}},"game_files":[],"notes":[]}}
JSON
cat > $W/p/settings.json <<JSON
{"installDir":"$W/lib","transferDir":"$W/xfer","sawLegal":true,"sawWhere":true,"countSetups":false,"lastVersion":"0.31.0","nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
OUT=$(SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-120000} scripts/smoke.sh scripts/smoke/doctor.js $W/p 2>&1 || true)
R=$(print -r -- "$OUT" | sed -n '/^RESULT/,$p' | tr -d '\n'); print -r -- "${R:-RESULT-ERROR no result}"
print -r -- "$R" | grep -q '"ok": *true'
