#!/bin/zsh
# Screenshots of every important screen, for the README and decompbuddy.com. Runs the real app hidden
# (scripts/smoke.sh - nothing appears on screen) on a throwaway profile with made-up installed games,
# never your own data. Folder paths shown on screen are replaced with a neutral one. Each screen is its own run; a missing or tiny picture fails the whole thing.
#   scripts/screenshots.sh            -> docs/screenshots/*.png (1280x800, light theme; THEME=dark for dark)
#   SET=extra SHOTS_OUT=<folder> scripts/screenshots.sh -> six screens the site doesn't show (press, interviews)
set -euo pipefail
cd "$(dirname "$0")/.."
W=~/.decomp-buddy-smoke/screenshots; OUT=${SHOTS_OUT:-docs/screenshots}
rm -rf $W; mkdir -p $W "$OUT"; OUT=$(cd "$OUT" && pwd)
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
{"installDir":"$T/Games","transferDir":"$T/Transfer to PC","romKeepDir":"$T/Kept Game Files","sawLegal":true,"sawWhere":true,"countSetups":false,"theme":"${THEME:-light}","lastVersion":"$(node -p "require(\"./package.json\").version")","target":"macos-arm64","window":{"width":1280,"height":800},"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100],
 "wishlist":{"github:perfect-dark-pc-port/perfect_dark":{"addedAt":"2026-10-01T00:00:00Z"}}}
JSON

# name | what to do before the picture (renderer globals from app.js/finding.js; the catalog is live)
SHOTS=(
  'browse|await loadCatalog({ refresh: true }); showView("browse"); $("catCon").value = "Nintendo 64"; $("catCon").dispatchEvent(new Event("input")); await wait(9000);'
  'new-games|await loadCatalog({ refresh: false }); showView("new"); await wait(9000);'
  'games-you-may-like|await loadCatalog({ refresh: false }); showView("foryou"); await wait(9000);'
  'game-page|await loadCatalog({ refresh: false }); const g = catalog.games.find((x) => /zelda64recomp/i.test(x.repo || "")); const ic = await window.buddy.catalogIcon(g.id); if (ic) iconCache.set(g.id, ic.dataUrl); await showDetail(g); await wait(9000);'
  'coming-soon|document.querySelector("nav.side button[data-nav=soon]").click(); for (let i = 0; i < 40 && !document.querySelector("#soonList .srcRow"); i++) await wait(500); await wait(1500);'
  'installed-games|await loadCatalog({ refresh: false, checkInstalled: true }); showView("library"); await wait(9000);'
  'settings|document.querySelector("nav.side button[data-nav=settings]").click(); await wait(2500);'
  'install-from-github|await loadCatalog({ refresh: false }); showView("setup"); $("target").value = "windows"; $("target").dispatchEvent(new Event("change")); await wait(1500); $("urls").value = "https://github.com/HarbourMasters/Shipwright\nhttps://github.com/xander-haj/Z3R"; $("analyze").click(); for (let i = 0; i < 60 && document.querySelectorAll("#games .game").length < 2; i++) await wait(1000); await wait(2000);'
)
# The extra set: Majora's Mask (Zelda 64: Recompiled) is the installed game the panels open on.
MM='const g = library.find((x) => /zelda64recomp/i.test(x.repo || ""));'
[ "${SET:-}" = extra ] && SHOTS=(
  'game-page-sonic|await loadCatalog({ refresh: false }); const g = catalog.games.find((x) => /unleashedrecomp/i.test(x.repo || "")); const ic = await window.buddy.catalogIcon(g.id); if (ic) iconCache.set(g.id, ic.dataUrl); await showDetail(g); await wait(9000);'
  'couch-mode|await loadCatalog({ refresh: false, checkInstalled: true }); await openCouch(); await wait(8000);'
  "game-options|await loadCatalog({ refresh: false, checkInstalled: true }); showView(\"library\"); await wait(4000); $MM await openMore(g); await wait(6000); [...document.querySelectorAll(\"#gamePanelBody h4\")].find((h) => /Check Game/.test(h.textContent)).scrollIntoView({ block: \"start\" }); await wait(1000);"
  "thunderstore-mods|await loadCatalog({ refresh: false, checkInstalled: true }); showView(\"library\"); await wait(4000); $MM await openMods(g); await wait(3000); \$(\"modsTsBtn\").click(); for (let i = 0; i < 40 && !document.querySelector(\"#modsTs .gbmod\"); i++) await wait(1000); await wait(4000); \$(\"modsTs\").scrollIntoView({ block: \"start\" }); await wait(1000);"
  'make-it-yours|await setLook({ accent: "#b8336a", cardSize: 190 }); document.querySelector("nav.side button[data-nav=settings]").click(); await wait(2500); [...document.querySelectorAll("label")].find((l) => l.textContent.trim() === "Make It Yours").scrollIntoView({ block: "start" }); await wait(1500);'
  'headsets-and-phones|document.querySelector("nav.side button[data-nav=devices]").click(); await wait(6000);'
)
# The Reddit set: one picture per feature the post sells. Ask Kirby asks one real question (a few cents).
[ "${SET:-}" = reddit ] && SHOTS=(
  'browse|await loadCatalog({ refresh: true }); showView("browse"); $("catRunsOn").value = ""; $("catRunsOn").dispatchEvent(new Event("input")); $("catSort").value = "popular"; $("catSort").dispatchEvent(new Event("input")); await wait(9000);'
  'ask-kirby|await loadCatalog({ refresh: false }); showView("browse"); for (let i = 0; i < 20 && $("kirbyBtn").hidden; i++) await wait(500); openKirby(); $("kirbyQ").value = "Something like Zelda that runs on a Steam Deck?"; $("kirbyForm").requestSubmit(); for (let i = 0; i < 90 && (kirbyBusy || !$("kirbyLog").textContent.trim()); i++) await wait(1000); await wait(4000); $("kirbyLog").scrollTop = 0; await wait(500);'
  'what-should-i-play|await loadCatalog({ refresh: false }); showView("browse"); openPick(); $("pickConsole").value = "Nintendo 64"; $("pickHow").value = "alone"; $("pickMatters").value = "complete"; await runPick(); await wait(3000);'
  'runs-on-meta-quest|await loadCatalog({ refresh: false }); showView("browse"); $("catRunsOn").value = "Meta Quest"; $("catRunsOn").dispatchEvent(new Event("change")); $("catRunsOn").dispatchEvent(new Event("input")); await wait(9000);'
  'runs-on-linux|await loadCatalog({ refresh: false }); showView("browse"); $("catRunsOn").value = "Linux"; $("catRunsOn").dispatchEvent(new Event("change")); $("catRunsOn").dispatchEvent(new Event("input")); $("catSort").value = "platforms"; $("catSort").dispatchEvent(new Event("input")); await wait(20000); document.querySelectorAll(".toast, #toast").forEach((t) => t.remove());'
  'hide-ai-assisted|await loadCatalog({ refresh: false }); showView("browse"); $("catNoAI").checked = true; $("catNoAI").dispatchEvent(new Event("change")); $("catNoAI").dispatchEvent(new Event("input")); await wait(9000);'
  'big-picture-mode|await loadCatalog({ refresh: false, checkInstalled: true }); await openCouch(); await wait(8000);'
  'coming-soon|document.querySelector("nav.side button[data-nav=soon]").click(); for (let i = 0; i < 40 && !document.querySelector("#soonList .srcRow"); i++) await wait(500); await wait(1500); for (const b of [...document.querySelectorAll("#soonList [data-watch]")].slice(0, 2)) { b.click(); await wait(1500); } await wait(1500);'
  'meta-quest-setup|document.querySelector("nav.side button[data-nav=devices]").click(); await wait(6000);'
)
for s in "${SHOTS[@]}"; do
  name=${s%%|*}; body=${s#*|}
  [[ -n "${ONLY:-}" && " $ONLY " != *" $name "* ]] && continue   # ONLY="a b" retakes just those
  print -r -- "await refresh(); $body document.getElementById('toast')?.remove(); return { ok: true };" > $W/$name.js
  rm -f "$OUT/$name.png"
  SMOKE_SHOT="$OUT/$name.png" SMOKE_TIMEOUT=150000 scripts/smoke.sh $W/$name.js $P > $W/$name.log 2>&1 || true
  size=$( [ -f "$OUT/$name.png" ] && stat -f%z "$OUT/$name.png" || echo 0 )
  [ "$size" -gt 60000 ] || { echo "✗ $name: no usable picture ($size bytes) - see $W/$name.log" >&2; exit 1; }
  echo "✓ $name ($(sips -g pixelWidth -g pixelHeight "$OUT/$name.png" | awk '/pixel/ {printf "%s ", $2}')· $((size / 1024)) KB)"
done
