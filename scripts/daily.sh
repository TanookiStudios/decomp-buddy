#!/bin/zsh
# The daily Decomp Buddy run - the parts a script can do. docs/DAILY.md is the whole run: it says what Claude does
# between these steps (sorting new repos, checking play picks for bait, writing install steps and AI labels).
#   scripts/daily.sh find      search every source for new repos -> sorter batches in ~/.decomp-buddy-triage/jobs
#   scripts/daily.sh steps     import the sorted batches, rebuild the catalog, prepare install-step jobs
#                              (new games + games whose new release changed shape) -> ~/.decomp-buddy-ccplans/batches/daily-*
#   scripts/daily.sh gates     import the install steps; follow new releases; malware-scan; follow again; AI-label prep
#   scripts/daily.sh publish   import AI labels, rebuild the catalog, deploy both sites, IndexNow, commit + push
#   scripts/daily.sh lock      start of a run: refuses (exit 3) while another run holds the lock; unlock at the end
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

# A step refreshes the lock it runs under, so `lock` can tell a live run from a dead one.
[[ "${1:-}" == (find|steps|gates|publish) && -f ~/.decomp-buddy-scan/run.lock ]] && touch ~/.decomp-buddy-scan/run.lock
case "${1:-}" in
  find)
    say "== $DAY find"
    node scripts/triage.mjs prep --scan 2>&1 | grep -E "^(queue|prep|reddit|bluesky|github|recomphaven|unbaked|awesome|recomp.fyi|player suggestions|admin actions|admin queue)" | tee -a "$LOG"
    ls ~/.decomp-buddy-triage/jobs/*.md 2>/dev/null | sed 's#.*/##;s#\.md$##' | tr '\n' ' ' | sed 's/^/batches: /' | tee -a "$LOG"; echo | tee -a "$LOG"
    mark find ;;
  steps)
    need find; say "== $DAY steps"
    node scripts/triage.mjs import --site "$SITE" 2>&1 | grep -E "^import" | tee -a "$LOG"
    # Our own copy of every download and its source code (scripts/mirror.mjs): new files this hour, then mark what we hold.
    node scripts/mirror.mjs --site "$SITE" --limit-gb 30 2>&1 | grep -E "^mirror|^failures" | tee -a "$LOG"
    # Source zips: 40 a run; big ones the Worker can't take are saved by .github/workflows/mirror-source.yml instead.
    node scripts/mirror.mjs --site "$SITE" --source --max 40 2>&1 | grep -E "^mirror|^failures" | tee -a "$LOG"
    node scripts/mirror.mjs --site "$SITE" --apply 2>&1 | grep -E "^mirror" | tee -a "$LOG"
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
    node scripts/trust.mjs --site "$SITE" 2>&1 | grep -E "^trust" | tee -a "$LOG"
    node scripts/credits.mjs --site "$SITE" 2>&1 | grep -E "^credits" | tee -a "$LOG"
    node scripts/follow.mjs --site "$SITE" 2>&1 | grep -E "^(follow|gone)" | tee -a "$LOG"
    node scripts/scan.mjs --site "$SITE" 2>&1 | grep -E "^(scan|another scan|FLAGGED|  FLAGGED|[0-9]+ published)" | tee -a "$LOG"
    node scripts/follow.mjs --site "$SITE" 2>&1 | grep -E "^(follow|gone)" | tee -a "$LOG"
    node scripts/ailabel.mjs prep --site "$SITE" 2>&1 | grep -E "^ailabel" | tee -a "$LOG"
    node scripts/features.mjs prep --site "$SITE" 2>&1 | grep -E "^features" | tee -a "$LOG"
    # How It Runs: plain computer details show by themselves; every note waits for the reader (docs/DAILY.md 6d).
    # A failure here must not hold new games back.
    node scripts/reports-screen.mjs prep --site "$SITE" 2>&1 | grep -E "^reports" | tee -a "$LOG" || say "✗ report screening failed (reports wait for the next run)"
    # Covers the strict matcher couldn't settle: wider searches, then batches for the cover-picking agent.
    # A failed cover search must not hold new games back: say so and go on.
    node scripts/boxart-picks.mjs widen --site "$SITE" 2>&1 | grep -E "^boxart" | tee -a "$LOG" || say "✗ box art search failed (covers wait for the next run)"
    node scripts/boxart-picks.mjs prep --site "$SITE" 2>&1 | grep -E "^boxart" | tee -a "$LOG"
    mark gates ;;
  publish)
    need gates; say "== $DAY publish"
    # Stars and download totals (Most GitHub Stars, Popular, the sitemap cut): once a day, about half an hour.
    # A failed run keeps yesterday's numbers.
    [[ -n $(find "$WEB/stars.json" -mmin -1200 2>/dev/null) ]] || (cd "$WEB" && GH_TOKEN=$GITHUB_TOKEN node stars.mjs 2>&1 | tail -1 | tee -a "$LOG") || say "✗ star run failed (yesterday's numbers stay)"
    node scripts/bestversion.mjs --site "$SITE" 2>&1 | grep -E "^(bestversion|  github)" | tee -a "$LOG"
    [[ -f ~/.decomp-buddy-ailabel/answers.json ]] && node scripts/ailabel.mjs import --site "$SITE" 2>&1 | grep -E "^ailabel" | tee -a "$LOG"
    [[ -f ~/.decomp-buddy-reports/answers.json ]] && { node scripts/reports-screen.mjs import --site "$SITE" 2>&1 | grep -E "^reports" | tee -a "$LOG" || say "✗ report answers not applied (they wait for the next run)"; }
    f=(~/.decomp-buddy-features/answers-*.json(N)); (( ${#f} )) && node scripts/features.mjs import --site "$SITE" 2>&1 | grep -E "^features" | tee -a "$LOG"
    f=(~/.decomp-buddy-boxart/answers/*.json(N)); (( ${#f} )) && { node scripts/boxart-picks.mjs import 2>&1 | grep -E "^boxart" | tee -a "$LOG"; mkdir -p ~/.decomp-buddy-boxart/answers-done; mv $f ~/.decomp-buddy-boxart/answers-done/; }
    node scripts/build-catalog.mjs --site "$SITE" 2>&1 | grep -E "^(catalog|waiting.json|steamgriddb|✗ steamgriddb)" | tee -a "$LOG"
    node scripts/newgames-check.mjs --site "$SITE" 2>&1 | tee -a "$LOG"
    npm --prefix "$SITE" run deploy 2>&1 | grep -E "Deployment complete|✘|ERROR" | tee -a "$LOG"
    npm --prefix "$WEB" run deploy 2>&1 | grep -E "^built|Deployment complete|✘|ERROR" | tee -a "$LOG"
    python3 ~/Documents/Tanooki-Business/tools/indexnow.py decompbuddy.com 2>&1 | tail -1 | tee -a "$LOG"
    # Live check: the catalog the app reads must be the one just built.
    want=$(python3 -c "import json;print(json.load(open('$SITE/public/decomp-buddy/catalog.json'))['count'])")
    got=$(curl -fsS https://tanookistudios.com/decomp-buddy/catalog.json | python3 -c "import json,sys;print(json.load(sys.stdin)['count'])")
    [[ "$want" == "$got" ]] || { say "✗ live catalog has $got games, built $want"; exit 1; }
    say "live catalog: $got games"
    # The app's own copy (app-catalog.json): same build, or every app shows yesterday's list.
    want=$(python3 -c "import json;d=json.load(open('$SITE/public/decomp-buddy/app-catalog.json'));print(d['generatedAt'],len(d['games']))")
    got=$(curl -fsS "https://tanookistudios.com/decomp-buddy/app-catalog.json?t=$(date +%s)" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['generatedAt'],len(d['games']))")
    [[ "$want" == "$got" ]] || { say "✗ live app catalog is '$got', built '$want'"; exit 1; }
    say "live app catalog: ${got#* } games"
    # Emails people who submitted a game that's now live or can't be listed (each once; the address is then deleted).
    curl -fsS -X POST https://tanookistudios.com/api/decomp-notify | tee -a "$LOG"; echo >> "$LOG"
    # Only Decomp Buddy's files: the studio site can hold other projects' unfinished work.
    git -C "$SITE" add public/decomp-buddy; git -C "$WEB" add -A
    for r in "$SITE" "$WEB"; do git -C "$r" diff --cached --quiet || git -C "$r" commit -qm "Daily Decomp Buddy update $DAY

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"; done
    # Everything lives on the Tanooki Studios account; push as it, whichever gh account is active.
    for r in "$SITE" "$WEB"; do git -C "$r" -c credential.helper= -c "credential.helper=!GH_TOKEN=$GITHUB_TOKEN gh auth git-credential" push -q 2>&1 | tail -1 || say "push failed: $r"; done
    mark publish; say "✓ $DAY published" ;;
  lock)
    # The run is hourly and a full one takes 2-3 hours: one at a time. Every step touches the lock (top of this
    # file), so its age is how long ago a step last started. A dead run is one with no step started for 2 hours
    # and none of the run's programs alive - 18 Nov 2026: a run killed by a full disk blocked every run for 3.5
    # hours under the old flat 6-hour rule and nobody was told.
    L=~/.decomp-buddy-scan/run.lock
    if [[ -f $L ]]; then
      if [[ -n $(find $L -mmin -120) ]] || pgrep -f "scripts/(daily\.sh (find|steps|gates|publish)|scan\.mjs|follow\.mjs|mirror\.mjs|triage\.mjs|credits\.mjs)|clamd|clamdscan|clamscan" >/dev/null; then
        echo "busy: another run started $(date -r $L '+%-I:%M %p')"; exit 3
      fi
      echo "TOOK OVER A DEAD RUN: its last step started $(date -r $L '+%-I:%M %p') and nothing of it is running. Tell Maddie (docs/DAILY.md, Final reply)."
    fi
    touch $L; echo "locked" ;;
  unlock) rm -f ~/.decomp-buddy-scan/run.lock; echo "unlocked" ;;
  *) echo "usage: scripts/daily.sh find|steps|gates|publish|lock|unlock"; exit 2 ;;
esac
