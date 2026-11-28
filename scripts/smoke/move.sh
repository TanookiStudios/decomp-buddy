#!/bin/zsh
# Move To Another Folder, end to end in the hidden app: More… → Move To Another Folder… moves a fake installed game
# (with a save inside) into another folder, it stays in Installed Games, and that folder joins Library Folders.
# Throwaway profile and fake game only.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/move; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile
mkdir -p "$T/lib/SoH/saves" "$T/xfer" "$T/elsewhere" $P
head -c 3000 /dev/urandom > "$T/lib/SoH/soh.exe"; echo save > "$T/lib/SoH/saves/file1.sav"
echo '{"decompBuddyVersion":1,"setUpAt":"2026-11-20T00:00:00.000Z","target":"windows","repo":"HarbourMasters/Shipwright","repoUrl":"https://github.com/HarbourMasters/Shipwright","release":{"tag":"9.2.0","url":"u","files":[]},"folder":"SoH","status":"ready","statusDetail":"","plan":{"game_title":"The Legend of Zelda: Ocarina of Time","console":"Nintendo 64","build":{"method":"release","executable":"soh.exe"},"game_files":[],"notes":[]}}' > "$T/lib/SoH/decomp-buddy.json"
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","sawLegal":true,"sawWhere":true,"startView":"library","lastVersion":"$(node -p 'require("./package.json").version')","nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
cat > $W/script.js <<'JS'
await refresh(); await wait(1500); $("whatsNewClose")?.click();
const before = library.find((g) => /Ocarina/.test(g.title));
await openMore(before); await wait(500);
$("moreMove").click(); await wait(2500);
const after = library.find((g) => /Ocarina/.test(g.title));
const s = await window.buddy.getSettings();
return { ok: !!after && after.folder.includes("/elsewhere/") && s.libraryFolders.some((d) => d.endsWith("/elsewhere")) && /Moved to/.test(document.querySelector("#gamePanel .status, #gamePanelState")?.textContent || ""), before: before?.folder, after: after?.folder, folders: s.libraryFolders, state: document.querySelector("#gamePanel .status, #gamePanelState")?.textContent };
JS
DECOMP_MOVE_TO="$T/elsewhere" SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-120000} scripts/smoke.sh $W/script.js $P
[[ -f "$T/elsewhere/SoH/saves/file1.sav" && ! -e "$T/lib/SoH" ]] && echo "✓ files moved, save inside" || { echo "✗ files not where they should be"; exit 1; }
