#!/bin/zsh
# A console port, end to end in the hidden app on a throwaway profile: Browse → Download Selected Games picks the
# console (not this Mac) → a real download → it lands in Console Games with its how-to file → Installed Games shows
# How To Install, which finds that file (a dry run: nothing opens on screen).
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/console; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile
mkdir -p "$T/games" "$T/xfer" $P
cp ~/Library/Application\ Support/decomp-buddy/catalog.json $P/ 2>/dev/null || true  # public catalog cache, read-only copy
cat > $P/settings.json <<JSON
{"installDir":"$T/games","transferDir":"$T/xfer","romKeepDir":"$T/kept","sawLegal":true,"sawWhere":true,"countSetups":false,"setupCount":0,"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
sed "s|__T__|$T|g; s|__GAME__|${GAME:-github:estebanpdn/legend-of-doom-3ds}|g" scripts/smoke/console.js > $W/script.js
DECOMP_TRASH_DIR=$T/trash SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-300000} scripts/smoke.sh $W/script.js $P
