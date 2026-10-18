#!/bin/zsh
# Phones And Headsets smoke: a fake adb (test/fixtures/fake-adb.mjs) that answers like a Meta Quest 3, a staged
# Quest game in a throwaway Library, then the hidden app lists, installs, reinstalls, launches and removes it.
# No real phone or headset is ever touched: DECOMP_ADB points at the fake, which only writes its own log.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/devices; rm -rf $W; mkdir -p $W
T=$W/fx; P=$W/profile; G="$T/lib/Doom - PC"
mkdir -p "$G/Game Files" "$T/xfer" $P
echo apk > "$G/QuestZDoom.apk"; echo wad > "$G/Game Files/doom.wad"
cat > "$G/decomp-buddy.json" <<JSON
{"decompBuddyVersion":1,"setUpAt":"2026-10-18T00:00:00.000Z","target":"quest","repo":"DrBeef/QuestZDoom","repoUrl":"https://github.com/DrBeef/QuestZDoom","release":{"tag":"v1","url":"u","files":[]},"folder":"Doom - PC","status":"staged","statusDetail":"Ready to copy to your headset.","apk":"QuestZDoom.apk","package_id":"com.drbeef.questzdoom",
 "plan":{"game_title":"Doom","console":"PC","build":{"method":"release","release_asset":"QuestZDoom.apk","release_tag":"v1","executable":null,"package_id":"com.drbeef.questzdoom"},
  "game_files":[{"label":"Doom WAD","drop_into":"Game Files","push_to":"QuestZDoom/wads","placed":{"name":"doom.wad","bytes":4}}],"notes":[]}}
JSON
cat > $P/settings.json <<JSON
{"installDir":"$T/lib","transferDir":"$T/xfer","sawLegal":true,"sawWhere":true,"countSetups":false}
JSON
cp scripts/smoke/devices.js $W/script.js
DECOMP_ADB=$PWD/test/fixtures/fake-adb.mjs FAKE_ADB_LOG=$W/adb.log SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-120000} scripts/smoke.sh $W/script.js $P
# What the app asked adb to do, checked from the fake's own record.
node -e '
const calls = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map((l) => JSON.parse(l).join(" "));
const want = [/install -r --streaming .*QuestZDoom\.apk$/, /push .*Game Files\/doom\.wad \/sdcard\/QuestZDoom\/wads\/doom\.wad$/, /pull \/sdcard\/QuestZDoom\/wads /, /shell monkey -p com\.drbeef\.questzdoom -c android\.intent\.category\.LAUNCHER 1$/, /uninstall -k com\.drbeef\.questzdoom$/];
const missing = want.filter((re) => !calls.some((c) => re.test(c)));
const installs = calls.filter((c) => / install -r /.test(c)).length;
if (missing.length || installs !== 2) { console.log("ADB-CHECK FAILED", { missing: missing.map(String), installs, calls }); process.exit(1); }
console.log(`ADB-CHECK OK (${calls.length} adb calls, ${installs} installs)`);
' $W/adb.log
