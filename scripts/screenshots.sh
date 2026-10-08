#!/bin/zsh
# Screenshots of every important screen, for the README and decompbuddy.com. Runs the real app hidden
# (scripts/smoke.sh - nothing appears on screen) on a throwaway profile with made-up installed games,
# never your own data. Folder paths shown on screen are replaced with a neutral one. Each screen is its own run; a missing or tiny picture fails the whole thing.
#   scripts/screenshots.sh            -> docs/screenshots/*.png (1280x800, light theme)
set -euo pipefail
cd "$(dirname "$0")/.."
W=~/.decomp-buddy-smoke/screenshots; OUT=docs/screenshots
rm -rf $W; mkdir -p $W $OUT
# Games and Transfer live in /Users/Shared so the folder paths on screen name no one (removed at the end).
P=$W/profile; T="/Users/Shared/Decomp Buddy Demo"; rm -rf "$T"; mkdir -p "$T/Games" "$T/Transfer to PC" $P
trap 'rm -rf "$T"' EXIT

# Made-up installs of real catalog projects (so their box art is real). Zelda 64: Recompiled is a
# version behind, so Update shows; Ship of Harkinian was played last, so it's Continue Playing.
install() { # folder repo tag title console [lastPlayed]
  local G="$T/Games/$1" lp=""; [ -n "${6:-}" ] && lp=",\"lastPlayed\":\"$6\""
  mkdir -p "$G/game.app/Contents/MacOS"; head -c 20000 /dev/urandom > "$G/game.app/Contents/MacOS/game"; chmod +x "$G/game.app/Contents/MacOS/game"
  printf '{"decompBuddyVersion":1,"setUpAt":"2026-10-01T00:00:00.000Z"%s,"target":"macos-arm64","repo":"%s","repoUrl":"https://github.com/%s","release":{"tag":"%s","url":"u","files":["game.app"]},"folder":"%s","status":"ready","statusDetail":"","plan":{"game_title":"%s","console":"%s","build":{"method":"release","executable":"game.app"},"game_files":[],"notes":[]}}\n' "$lp" "$2" "$2" "$3" "$1" "$4" "$5" > "$G/decomp-buddy.json"
}
install "Ship of Harkinian - Nintendo 64" HarbourMasters/Shipwright 9.0.2 "The Legend of Zelda: Ocarina of Time" "Nintendo 64" 2026-10-07T21:00:00.000Z
install "Zelda 64 Recompiled - Nintendo 64" Zelda64Recomp/Zelda64Recomp v1.1.0 "The Legend of Zelda: Majora's Mask" "Nintendo 64"
install "Sonic Unleashed Recompiled - Xbox 360" hedge-dev/UnleashedRecomp v1.0.3 "Sonic Unleashed" "Xbox 360"
install "Perfect Dark - Nintendo 64" perfect-dark-pc-port/perfect_dark ci-dev-build "Perfect Dark" "Nintendo 64"
install "Metroid Prime - GameCube" Odrannnn/MetroidPrimePort v0.18.0 "Metroid Prime" "GameCube"
cat > $P/settings.json <<JSON
{"installDir":"$T/Games","transferDir":"$T/Transfer to PC","sawLegal":true,"theme":"light","target":"macos-arm64","window":{"width":1280,"height":800},"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100],
 "wishlist":{"github:perfect-dark-pc-port/perfect_dark":{"addedAt":"2026-10-01T00:00:00Z"}}}
JSON

# name | what to do before the picture (renderer globals from app.js/finding.js; the catalog is live)
SHOTS=(
  'browse|await loadCatalog({ refresh: true }); showView("browse"); [...document.querySelectorAll("#conBar [data-con]")].find((b) => b.dataset.con === "Nintendo 64")?.click(); await wait(9000);'
  'new-games|await loadCatalog({ refresh: false }); showView("new"); await wait(9000);'
  'games-you-may-like|await loadCatalog({ refresh: false }); showView("foryou"); await wait(9000);'
  'game-page|await loadCatalog({ refresh: false }); const g = catalog.games.find((x) => /zelda64recomp/i.test(x.repo || "")); const ic = await window.buddy.catalogIcon(g.id); if (ic) iconCache.set(g.id, ic.dataUrl); await showDetail(g); await wait(9000);'
  'installed-games|await loadCatalog({ refresh: false, checkInstalled: true }); showView("library"); await wait(9000);'
  'install-from-github|await loadCatalog({ refresh: false }); showView("setup"); $("target").value = "windows"; $("target").dispatchEvent(new Event("change")); await wait(1500); $("urls").value = "https://github.com/HarbourMasters/Shipwright\nhttps://github.com/xander-haj/Z3R"; $("analyze").click(); for (let i = 0; i < 60 && document.querySelectorAll("#games .game").length < 2; i++) await wait(1000); await wait(2000);'
)
for s in "${SHOTS[@]}"; do
  name=${s%%|*}; body=${s#*|}
  print -r -- "await refresh(); $body document.getElementById('toast')?.remove(); return { ok: true };" > $W/$name.js
  rm -f "$OUT/$name.png"
  SMOKE_SHOT="$PWD/$OUT/$name.png" SMOKE_TIMEOUT=150000 scripts/smoke.sh $W/$name.js $P > $W/$name.log 2>&1 || true
  size=$( [ -f "$OUT/$name.png" ] && stat -f%z "$OUT/$name.png" || echo 0 )
  [ "$size" -gt 60000 ] || { echo "✗ $name: no usable picture ($size bytes) - see $W/$name.log" >&2; exit 1; }
  echo "✓ $name ($(sips -g pixelWidth -g pixelHeight "$OUT/$name.png" | awk '/pixel/ {printf "%s ", $2}')· $((size / 1024)) KB)"
done
