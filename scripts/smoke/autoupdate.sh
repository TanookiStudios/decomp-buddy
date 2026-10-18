#!/bin/zsh
# Auto Update real ride: an "old" Lufia 2 install in a throwaway library; Check Now must find the update, download
# the scanned file and install it into the same folder, with no Set Up screen. Needs the internet.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/autoupdate; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile; G="$T/lib/Lufia II Rise Of The Sinistrals"
mkdir -p "$G" "$T/xfer" $P
echo old > "$G/Lufia2Recomp"
cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-01T00:00:00.000Z","target":"linux","repo":"cellenseres/lufia2snesrecomp","repoUrl":"https://github.com/cellenseres/lufia2snesrecomp","release":{"tag":"v0.1.0","files":["Lufia2Recomp"]},"folder":"Lufia II Rise Of The Sinistrals","status":"files_needed","autoUpdate":true,"plan":{"game_title":"Lufia II: Rise of the Sinistrals","console":"SNES","build":{"method":"release","release_asset":"Lufia2Recomp-linux-x64.tar.gz","release_tag":"v0.1.0","executable":"Lufia2Recomp"},"game_files":[]}}
JSON
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","sawLegal":true,"sawWhere":true,"countSetups":false,"target":"linux"}
JSON
cat > $W/script.js <<'JS'
const r = await window.buddy.autoUpdateCheck();
const lib = await window.buddy.libraryList();
const g = lib.find((x) => x.originalTitle.startsWith("Lufia"));
return { ok: r.installed.length === 1 && g?.tag === "v0.9.2" && !r.failed.length, result: r, tag: g?.tag, folder: g?.folder };
JS
SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-300000} scripts/smoke.sh $W/script.js $P
