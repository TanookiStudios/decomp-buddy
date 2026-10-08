#!/bin/zsh
# Finding smoke: one installed game (Case Zero) + a stale digest, then Games You May Like / New Games / Browse / game page.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/finding; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile; G="$T/lib/Dead Rising 2 Case Zero - Xbox 360"
mkdir -p "$G" "$T/xfer" $P
head -c 300000 /dev/urandom > "$G/DR2CZ.exe"
cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-01T00:00:00.000Z","target":"windows","repo":"wivi514/Dead_Rising_2_Case_Zero_Xenon_Recomp","repoUrl":"https://github.com/wivi514/Dead_Rising_2_Case_Zero_Xenon_Recomp","release":{"tag":"v1.0.0","url":"u","files":["DR2CZ.exe"]},"folder":"Dead Rising 2 Case Zero - Xbox 360","status":"ready","statusDetail":"","plan":{"game_title":"Dead Rising 2: Case Zero","console":"Xbox 360","build":{"method":"release","executable":"DR2CZ.exe"},"game_files":[],"notes":[]}}
JSON
cp ~/Library/Application\ Support/decomp-buddy/catalog.json $P/ 2>/dev/null || true
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","sawLegal":true,"target":"windows","nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100],
 "wishlist":{"github:florinp93/hells-gate-recomp":{"addedAt":"2026-09-01T00:00:00Z"}},
 "digest":{"at":"2026-09-01T00:00:00.000Z","seen":{"github:wivi514/dead_rising_2_case_zero_xenon_recomp":"v1.0.0"},"items":[]}}
JSON
cp scripts/smoke/finding.js $W/script.js
SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-180000} scripts/smoke.sh $W/script.js $P
