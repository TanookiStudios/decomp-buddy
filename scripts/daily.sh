#!/bin/zsh
# The daily Decomp Buddy run - the parts a script can do. docs/DAILY.md is the whole run: it says what Claude does
# between these steps (sorting new repos, checking play picks for bait, writing install steps and AI labels).
#   scripts/daily.sh find      search every source for new repos -> sorter batches in ~/.decomp-buddy-triage/jobs
#   scripts/daily.sh steps     import the sorted batches, rebuild the catalog, prepare install-step jobs
#                              (new games + games whose new release changed shape) -> ~/.decomp-buddy-ccplans/batches/daily-*
#   scripts/daily.sh gates     import the install steps; follow new releases; malware-scan; follow again; AI-label prep
#   scripts/daily.sh publish   import AI labels, rebuild the catalog, deploy both sites, IndexNow, commit + push
# Each step stops at the first failure; publish never runs on a half-done day (it checks the earlier steps' marks).
set -euo pipefail
cd "$(dirname "$0")/.."
SITE=~/Documents/GitHub/TanookiStudios-Site
WEB=~/Documents/GitHub/DecompBuddy-Site
DAY=$(date +%F)
LOG=~/.decomp-buddy-scan/daily-$DAY.txt
mkdir -p ~/.decomp-buddy-scan
export GITHUB_TOKEN=$(gh auth token -u TanookiStudios)
say() { echo "$*" | tee -a "$LOG"; }
mark() { touch ~/.decomp-buddy-scan/daily-$DAY.$1; }
need() { [[ -f ~/.decomp-buddy-scan/daily-$DAY.$1 ]] || { say "✗ run '$1' first today"; exit 1; }; }

case "${1:-}" in
  find)
    say "== $DAY find"
    node scripts/triage.mjs prep --scan 2>&1 | grep -E "^(queue|prep|reddit|bluesky|github|recomphaven|unbaked)" | tee -a "$LOG"
    ls ~/.decomp-buddy-triage/jobs/*.md 2>/dev/null | sed 's#.*/##;s#\.md$##' | tr '\n' ' ' | sed 's/^/batches: /' | tee -a "$LOG"; echo | tee -a "$LOG"
    mark find ;;
  steps)
    need find; say "== $DAY steps"
    node scripts/triage.mjs import --site "$SITE" 2>&1 | grep -E "^import" | tee -a "$LOG"
    node scripts/build-catalog.mjs --site "$SITE" 2>&1 | grep -E "^(catalog|waiting.json|steamgriddb|✗ steamgriddb)" | tee -a "$LOG"
    touch ~/.decomp-buddy-scan/follow-replan.txt
    node scripts/ccplans.mjs prep --site "$SITE" --replan ~/.decomp-buddy-scan/follow-replan.txt 2>&1 | grep -E "^prep" | tee -a "$LOG"
    # New jobs (the ones without an answer yet) into batches of 10 for the plan agents.
    J=~/.decomp-buddy-ccplans; find $J/batches -name "daily-*" -delete
    python3 - "$J" <<'PY'
import json, os, sys
J = sys.argv[1]; m = json.load(open(os.path.join(J, "manifest.json")))
ids = [w["id"] for w in m if not os.path.exists(os.path.join(J, "out", w["id"] + ".json"))]
for n in range(0, len(ids), 10): open(os.path.join(J, "batches", f"daily-{n // 10:02d}.txt"), "w").write("\n".join(ids[n:n + 10]) + "\n")
print(f"plan jobs: {len(ids)} in {(len(ids) + 9) // 10} batch(es)")
PY
    mark steps ;;
  gates)
    need steps; say "== $DAY gates"
    node scripts/ccplans.mjs import --site "$SITE" 2>&1 | grep -E "^import" | tee -a "$LOG"
    node scripts/follow.mjs --site "$SITE" 2>&1 | grep -E "^follow" | tee -a "$LOG"
    node scripts/scan.mjs --site "$SITE" 2>&1 | grep -E "^(scan|another scan|FLAGGED|  FLAGGED|[0-9]+ published)" | tee -a "$LOG"
    node scripts/follow.mjs --site "$SITE" 2>&1 | grep -E "^follow" | tee -a "$LOG"
    node scripts/ailabel.mjs prep --site "$SITE" 2>&1 | grep -E "^ailabel" | tee -a "$LOG"
    mark gates ;;
  publish)
    need gates; say "== $DAY publish"
    [[ -f ~/.decomp-buddy-ailabel/answers.json ]] && node scripts/ailabel.mjs import --site "$SITE" 2>&1 | grep -E "^ailabel" | tee -a "$LOG"
    node scripts/build-catalog.mjs --site "$SITE" 2>&1 | grep -E "^(catalog|waiting.json|steamgriddb|✗ steamgriddb)" | tee -a "$LOG"
    npm --prefix "$SITE" run deploy 2>&1 | grep -E "Deployment complete|✘|ERROR" | tee -a "$LOG"
    npm --prefix "$WEB" run deploy 2>&1 | grep -E "^built|Deployment complete|✘|ERROR" | tee -a "$LOG"
    python3 ~/Documents/Tanooki-Business/tools/indexnow.py decompbuddy.com 2>&1 | tail -1 | tee -a "$LOG"
    # Live check: the catalog the app reads must be the one just built.
    want=$(python3 -c "import json;print(json.load(open('$SITE/public/decomp-buddy/catalog.json'))['count'])")
    got=$(curl -fsS https://tanookistudios.com/decomp-buddy/catalog.json | python3 -c "import json,sys;print(json.load(sys.stdin)['count'])")
    [[ "$want" == "$got" ]] || { say "✗ live catalog has $got games, built $want"; exit 1; }
    say "live catalog: $got games"
    # Only Decomp Buddy's files: the studio site can hold other projects' unfinished work.
    git -C "$SITE" add public/decomp-buddy; git -C "$WEB" add -A
    for r in "$SITE" "$WEB"; do git -C "$r" diff --cached --quiet || git -C "$r" commit -qm "Daily Decomp Buddy update $DAY

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"; done
    # Everything lives on the Tanooki Studios account; push as it, whichever gh account is active.
    for r in "$SITE" "$WEB"; do git -C "$r" -c credential.helper= -c "credential.helper=!GH_TOKEN=$GITHUB_TOKEN gh auth git-credential" push -q 2>&1 | tail -1 || say "push failed: $r"; done
    mark publish; say "✓ $DAY published" ;;
  *) echo "usage: scripts/daily.sh find|steps|gates|publish"; exit 2 ;;
esac
