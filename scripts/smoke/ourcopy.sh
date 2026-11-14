#!/bin/zsh
# A real install that downloads from Decomp Buddy's own copy (files.decompbuddy.com), in the hidden app on a throwaway
# profile: the profile's install steps are the published ones with our copies marked (scripts/mirror.mjs --apply).
set -eu
cd "$(dirname "$0")/../.."
SITE=~/Documents/GitHub/TanookiStudios-Site/public/decomp-buddy
W=~/.decomp-buddy-smoke/ourcopy; rm -rf $W; mkdir -p $W/data $W/fx/games $W/profile
T=$W/fx; P=$W/profile
cp $SITE/finds.json $SITE/app-catalog.json $W/data/
node --input-type=module -e "import fs from 'node:fs'; import { applyMirror } from './src/mirror.js'; const p = JSON.parse(fs.readFileSync('$SITE/plans.json')); applyMirror(p, JSON.parse(fs.readFileSync('$SITE/mirror.json'))); fs.writeFileSync('$W/data/plans.json', JSON.stringify(p));"
cat > $P/settings.json <<JSON
{"installDir":"$T/games","transferDir":"$T/xfer","findsFile":"$W/data/finds.json","sawLegal":true,"sawWhere":true,"countSetups":false,"setupCount":0,"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
sed "s|__GAME__|${GAME:-github:brawmario/infinite-mario-64-ever}|g" scripts/smoke/ourcopy.js > $W/script.js
DECOMP_TRASH_DIR=$T/trash SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-400000} scripts/smoke.sh $W/script.js $P
