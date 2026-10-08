#!/bin/zsh
# Mods smoke: a fake Ship of Harkinian install; browse GameBanana, download its smallest mod file
# (real network, MD5-checked), load order + conflicts on two enabled packs. No dialogs.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/mods; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile; G="$T/lib/Ocarina of Time - N64"
mkdir -p "$G/mods" "$G/Decomp Buddy Mods" "$T/xfer" $P
head -c 300000 /dev/urandom > "$G/soh.exe"
python3 - "$G" <<'PY'
import sys, zipfile, os
g = sys.argv[1]
for name, files in [("A Pack.o2r", {"textures/link/tunic.png": "1", "readme.txt": "x"}), ("B Pack.o2r", {"textures/link/tunic.png": "2"})]:
    for d in ("Decomp Buddy Mods", "mods"):
        with zipfile.ZipFile(os.path.join(g, d, name), "w") as z:
            for n, c in files.items(): z.writestr(n, c)
PY
cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-09-01T00:00:00.000Z","target":"windows","repo":"HarbourMasters/Shipwright","repoUrl":"https://github.com/HarbourMasters/Shipwright","release":{"tag":"9.2.0","url":"u","files":["soh.exe"]},"folder":"Ocarina of Time - N64","status":"ready","statusDetail":"","plan":{"game_title":"The Legend of Zelda: Ocarina of Time","console":"Nintendo 64","build":{"method":"release","executable":"soh.exe"},"game_files":[],"notes":[],"mods":{"supported":true,"method":"folder","folder":"mods","formats":[".otr",".o2r"],"notes":"","links":[]}}}
JSON
cp ~/Library/Application\ Support/decomp-buddy/catalog.json $P/ 2>/dev/null || true
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","sawLegal":true,"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
cp scripts/smoke/mods.js $W/script.js
SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-240000} scripts/smoke.sh $W/script.js $P
