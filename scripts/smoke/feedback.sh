#!/bin/zsh
# A player's email, 27 Nov 2026: endless "Update", Open On Installed Games, Project Page / What's New on cards,
# Shortcut Folder, Keep Old Versions. Throwaway profile and fake games only; nothing from the real app profile.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/feedback; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile; S=$W/site
mkdir -p "$T/lib/SoH Linux" "$T/lib/SoH Win" "$T/shortcuts" "$T/xfer" $P $S
head -c 3000 /dev/urandom > "$T/lib/SoH Win/soh.exe"
man() { echo "{\"decompBuddyVersion\":1,\"setUpAt\":\"2026-11-20T00:00:00.000Z\",\"target\":\"$1\",\"repo\":\"HarbourMasters/Shipwright\",\"repoUrl\":\"https://github.com/HarbourMasters/Shipwright\",\"release\":{\"tag\":\"$2\",\"url\":\"u\",\"files\":[]},\"folder\":\"$3\",\"status\":\"ready\",\"statusDetail\":\"\",\"plan\":{\"game_title\":\"The Legend of Zelda: Ocarina of Time\",\"console\":\"Nintendo 64\",\"build\":{\"method\":\"release\",\"executable\":\"soh.exe\"},\"game_files\":[],\"notes\":[]}}"; }
# Linux has what its own plan installs (9.2.3, while the card shows 9.3.1): no update. Windows really is behind.
man linux 9.2.3 "SoH Linux" > "$T/lib/SoH Linux/decomp-buddy.json"
man windows 9.2.0 "SoH Win" > "$T/lib/SoH Win/decomp-buddy.json"
# The app's catalog as the next hourly build will publish it (per-platform versions added from the real plans).
node -e '
const [ac, pl, out] = process.argv.slice(1); const fs = require("fs");
import(process.cwd() + "/src/expand.js").then(({ targetTags }) => {
  const c = JSON.parse(fs.readFileSync(ac)), p = JSON.parse(fs.readFileSync(pl));
  for (const g of c.games) { const e = g.owner && p.plans[`${g.repoHost || "github"}:${g.owner}/${g.repo}`.toLowerCase()]; if (e && !g.repoGames && g.publishedTag) { const tt = targetTags(e); if (Object.values(tt).some((x) => x !== g.publishedTag)) g.targetTags = tt; } }
  fs.writeFileSync(out, JSON.stringify(c));
});' ~/Documents/GitHub/TanookiStudios-Site/public/decomp-buddy/app-catalog.json ~/Documents/GitHub/TanookiStudios-Site/public/decomp-buddy/plans.json $S/app-catalog.json
echo '{"games":[]}' > $S/finds.json
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","findsFile":"$S/finds.json","sawLegal":true,"sawWhere":true,"setupCount":0,"startView":"library","shortcutDir":"$T/shortcuts","keepVersions":0,"lastVersion":"$(node -p 'require("./package.json").version')","nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
sed "s|__T__|$T|g" scripts/smoke/feedback.js > $W/script.js
SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-180000} scripts/smoke.sh $W/script.js $P
