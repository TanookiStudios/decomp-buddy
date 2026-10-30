#!/bin/zsh
# Find My Steam And GOG Games smoke: a fake home folder with a Steam library holding Fallout 2's data files.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/stores; rm -rf $W; mkdir -p $W/p $W/lib
F="$W/home/Library/Application Support/Steam/steamapps"; mkdir -p "$F/common/Fallout 2/data"
print -r -- '"AppState" { "appid" "38410" "name" "Fallout 2: A Post Nuclear Role Playing Game" "installdir" "Fallout 2" }' > "$F/appmanifest_38410.acf"
for f in MASTER.DAT CRITTER.DAT patch000.dat; do head -c 4096 /dev/urandom > "$F/common/Fallout 2/$f"; done
cat > $W/p/settings.json <<JSON
{"installDir":"$W/lib","sawLegal":true,"sawWhere":true,"countSetups":false,"lastVersion":"0.31.0","nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
OUT=$(HOME=$W/home SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-150000} scripts/smoke.sh scripts/smoke/stores.js $W/p 2>&1 || true)
R=$(print -r -- "$OUT" | sed -n '/^RESULT/,$p' | tr -d '\n'); print -r -- "${R:-RESULT-ERROR no result: $(print -r -- "$OUT" | tail -3)}"
ls "$F/common/Fallout 2" | tr '\n' ' '; echo
print -r -- "$R" | grep -q '"ok": *true'
