#!/bin/zsh
# Thank The Developer smoke: one installed game with 90 minutes of play. Hidden window, throwaway folders.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/thanks; rm -rf $W; mkdir -p "$W/lib/Alpha - N64" $W/p
cat > "$W/lib/Alpha - N64/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-01T00:00:00.000Z","lastPlayed":"2026-10-20T00:00:00.000Z","playMinutes":90,"target":"macos-arm64","repo":"x/alpha","repoUrl":"https://github.com/x/alpha","release":{"tag":"v1","url":"u","files":[]},"folder":"Alpha - N64","status":"ready","statusDetail":"","plan":{"game_title":"Alpha","console":"Nintendo 64","build":{"method":"release","executable":"Alpha"},"game_files":[],"notes":[]}}
JSON
cat > $W/p/settings.json <<JSON
{"installDir":"$W/lib","sawLegal":true,"sawWhere":true,"countSetups":false,"lastVersion":"0.31.0","nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
OUT=$(SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-90000} scripts/smoke.sh scripts/smoke/thanks.js $W/p 2>&1 || true)
R=$(print -r -- "$OUT" | sed -n '/^RESULT/,$p' | tr -d '\n'); print -r -- "${R:-RESULT-ERROR no result}"
grep -q '"thanked": true' "$W/lib/Alpha - N64/decomp-buddy.json" && echo "manifest: thanked" || echo "manifest: NOT thanked"
print -r -- "$R" | grep -q '"ok": *true'
