#!/bin/zsh
# Set-up tools smoke: a Windows copy on the Mac + Wine (from the Wine ride) -> Play With Wine,
# Settings shows Wine, Offline Pack panel lists games. Nothing is launched and no dialog is opened.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/setuptools; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile; G="$T/xfer/Cave Story - PC"
mkdir -p "$G" "$T/lib" $P/tools
head -c 300000 /dev/urandom > "$G/Doukutsu.exe"; printf 'MZ' | cat - "$G/Doukutsu.exe" > "$G/x" && mv "$G/x" "$G/Doukutsu.exe"
cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-01T00:00:00.000Z","target":"windows","repo":"x/cavestory","repoUrl":"https://github.com/x/cavestory","release":{"tag":"v1","url":"u","files":["Doukutsu.exe"]},"folder":"Cave Story - PC","status":"ready","statusDetail":"","plan":{"game_title":"Cave Story","console":"PC","build":{"method":"release","executable":"Doukutsu.exe"},"game_files":[],"notes":[]}}
JSON
[[ -d ~/.decomp-buddy-smoke/wine/tools ]] && ln -s ~/.decomp-buddy-smoke/wine/tools $P/tools/wine
cp ~/Library/Application\ Support/decomp-buddy/catalog.json $P/ 2>/dev/null || true
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","sawLegal":true,"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
cp scripts/smoke/setuptools.js $W/script.js
SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-120000} scripts/smoke.sh $W/script.js $P
