#!/bin/zsh
# Quick Play smoke: three installed games, two of them played. Hidden window, throwaway folders, nothing launched.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/quickplay; rm -rf $W; mkdir -p $W/lib $W/p
for n in Alpha Bravo Charlie; do
  G="$W/lib/$n - N64"; mkdir -p "$G"
  case $n in Alpha) LP=',"lastPlayed":"2026-10-01T00:00:00.000Z"';; Charlie) LP=',"lastPlayed":"2026-10-20T00:00:00.000Z"';; *) LP='';; esac
  cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-01T00:00:00.000Z"$LP,"target":"macos-arm64","repo":"x/$n","repoUrl":"u","release":{"tag":"v1","url":"u","files":[]},"folder":"$n - N64","status":"ready","statusDetail":"","plan":{"game_title":"$n","console":"Nintendo 64","build":{"method":"release","executable":"$n"},"game_files":[],"notes":[]}}
JSON
done
cat > $W/p/settings.json <<JSON
{"installDir":"$W/lib","sawLegal":true,"sawWhere":true,"countSetups":false,"lastVersion":"0.31.0","nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
OUT=$(SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-90000} scripts/smoke.sh scripts/smoke/quickplay.js $W/p 2>&1 || true)
R=$(print -r -- "$OUT" | sed -n '/^RESULT/,$p' | tr -d '\n'); print -r -- "${R:-RESULT-ERROR no result}"
print -r -- "$R" | grep -q '"ok": *true'
