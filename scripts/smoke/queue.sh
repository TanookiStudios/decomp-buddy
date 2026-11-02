#!/bin/zsh
# Install When Online, end to end: set a real published game up with no internet (it waits), then start the app
# again online with the same profile and check it set itself up. Throwaway profile and folders; no token.
set -u
cd "$(dirname "$0")/../.."
REPO=${QUEUE_REPO:-https://github.com/crowded-street/3sx}
W=$(mktemp -d -t db-queue); P=$W/profile; mkdir -p $P $W/lib $W/xfer
head -c 1000 /dev/urandom > $W/my-game-file.bin
echo "{\"installDir\":\"$W/lib\",\"transferDir\":\"$W/xfer\",\"sawLegal\":true,\"target\":\"windows\",\"moveFiles\":false}" > $P/settings.json
for step in 1 2; do
  { echo "const QUEUE_STEP = $step, QUEUE_REPO = \"$REPO\", QUEUE_PICK = \"$W/my-game-file.bin\";"; cat scripts/smoke/queue.js; } > $W/step$step.js
  extra=(); [[ $step == 1 ]] && extra=(DECOMP_OFFLINE=1)
  r=$(env -u GITHUB_TOKEN DECOMP_SITE_DIR=/nonexistent SMOKE_TIMEOUT=240000 "${extra[@]}" scripts/smoke.sh $W/step$step.js $P 2>/dev/null | sed -n '/^RESULT/,$p')
  echo "step $step: $(echo "$r" | tr -d '\n' | tr -s ' ' | cut -c1-400)"
  [[ $r == *'"ok": true'* ]] || { echo "✗ step $step failed"; rm -rf $W; exit 1; }
done
ls "$W/lib" | head -3; rm -rf $W; echo "✓ install when online"
