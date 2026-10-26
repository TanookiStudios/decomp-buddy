#!/bin/zsh
# App Store screenshots + the App Review video for Decomp Buddy Remote, from demo data in a simulator that runs
# hidden (no Simulator window). Output: ios/screenshots/*.png and ios/screenshots/review-walkthrough.mp4.
# Fails loudly if any screen is missing. Shuts the simulator down afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."
DEV_NAME="${DEV_NAME:-iPhone 17 Pro Max}"   # 6.9-inch: the size App Store Connect asks for
DEV=$(xcrun simctl list devices available | grep -m1 "$DEV_NAME (" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/')
[[ -n "$DEV" ]] || { echo "✗ no simulator named $DEV_NAME"; exit 1; }
OUT=screenshots; RES=$(mktemp -d)/run.xcresult; rm -rf "$OUT"; mkdir -p "$OUT"
xcodegen generate >/dev/null
xcrun simctl boot "$DEV" 2>/dev/null || true; xcrun simctl bootstatus "$DEV" -b >/dev/null
xcrun simctl status_bar "$DEV" override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4 || true
trap 'kill $REC 2>/dev/null || true; xcrun simctl shutdown "$DEV" 2>/dev/null || true' EXIT
# The App Review video. Only one recording can run on this Mac at a time (another app's harness may hold it).
VLOG=$(mktemp); xcrun simctl io "$DEV" recordVideo --codec=h264 --display=internal --force "$OUT/review-walkthrough.mp4" 2>"$VLOG" & REC=$!
for i in {1..20}; do grep -q "Recording started" "$VLOG" && break; kill -0 $REC 2>/dev/null || break; sleep 0.5; done
grep -q "Recording started" "$VLOG" || { cat "$VLOG"; echo "✗ couldn't start the review video recording - try again in a few minutes"; exit 1; }
xcodebuild test -project DecompBuddyRemote.xcodeproj -scheme DecompBuddyRemote -only-testing:DecompBuddyRemoteUITests -destination "id=$DEV" \
  -derivedDataPath build -resultBundlePath "$RES" CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=YES >/tmp/db-remote-shots.log 2>&1 || { tail -30 /tmp/db-remote-shots.log; echo "✗ UI test failed"; exit 1; }
kill -INT $REC 2>/dev/null || true; wait $REC 2>/dev/null || true
X=$(mktemp -d); xcrun xcresulttool export attachments --path "$RES" --output-path "$X" >/dev/null
python3 - "$X" "$OUT" <<'PY'
import json, os, shutil, sys
x, out = sys.argv[1:]; m = json.load(open(os.path.join(x, "manifest.json")))
names = {}
for t in m:
    for a in t.get("attachments", []):
        names[a["suggestedHumanReadableName"].split("_")[0]] = a["exportedFileName"]
want = ["01-browse", "02-game", "03-library", "04-wishlist", "05-computers"]
missing = [w for w in want if w not in names]
if missing: sys.exit(f"✗ missing screens: {missing}")
for w in want: shutil.copy(os.path.join(x, names[w]), os.path.join(out, f"{w}.png"))
print(f"✓ {len(want)} screenshots")
PY
[[ -s "$OUT/review-walkthrough.mp4" ]] || { echo "✗ the review video is empty"; exit 1; }
ls -la "$OUT" | tail -n +2
