#!/bin/zsh
# Download Selected Games, end to end in the hidden app on a throwaway profile: Browse → read from the stored
# install steps (no repo reading) for this computer → pick a game file → Prepare Games (a real download) →
# Ready screen → Installed Games tile → Uninstall Game → Move Rom Out Safely. Trash is a throwaway folder.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/flow; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile
mkdir -p "$T/games" "$T/xfer" "$T/mine" $P
printf 'FILE "Ignition.bin" BINARY\n  TRACK 01 MODE1/2352\n    INDEX 01 00:00:00\n' > "$T/mine/Ignition.cue"
head -c 3000000 /dev/urandom > "$T/mine/Ignition.bin"
cp ~/Library/Application\ Support/decomp-buddy/catalog.json $P/ 2>/dev/null || true  # public catalog cache, read-only copy
# Build For is set to Windows on purpose: Download Selected Games must ignore it and use this computer.
cat > $P/settings.json <<JSON
{"installDir":"$T/games","transferDir":"$T/xfer","romKeepDir":"$T/kept","target":"windows","sawLegal":true,"sawWhere":true,"countSetups":false,"setupCount":0,"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
sed "s|__T__|$T|g" scripts/smoke/flow.js > $W/script.js
DECOMP_TRASH_DIR=$T/trash SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-300000} scripts/smoke.sh $W/script.js $P
