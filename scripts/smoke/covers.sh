#!/bin/zsh
# Save All Covers For Offline, end to end on a fresh profile: saves a cover for nearly every game (shrunk to tile size,
# so the whole set stays small), then with no internet the covers still show. Needs the network; about a minute.
set -u
cd "$(dirname "$0")/../.."
P=$(mktemp -d -t db-covers)
for mode in on off; do
  { echo "const COVERS_OFFLINE = $([[ $mode == off ]] && echo true || echo false);"; cat scripts/smoke/covers.js; } > $P/$mode.js
  extra=(); [[ $mode == off ]] && extra=(DECOMP_OFFLINE=1)
  r=$(env -u GITHUB_TOKEN DECOMP_SITE_DIR=/nonexistent SMOKE_TIMEOUT=1000000 "${extra[@]}" scripts/smoke.sh $P/$mode.js $P/profile 2>/dev/null | sed -n '/^RESULT/,$p' | tr -d '\n' | tr -s ' ')
  echo "$mode: $r" | cut -c1-240
  [[ $r == *'"ok": true'* ]] || { rm -rf $P; echo "✗ covers ($mode)"; exit 1; }
done
mb=$(du -sm $P/profile/icons | cut -f1); rm -rf $P
(( mb < 400 )) || { echo "✗ covers take $mb MB - they should be shrunk to tile size"; exit 1; }
echo "✓ covers for offline ($mb MB)"
