#!/bin/zsh
# What's New smoke: an upgrade from 0.30.7 shows this version's notes once; a fresh install shows nothing at
# start; both can open every version from the menu. Hidden window, throwaway profiles.
set -eu
cd "$(dirname "$0")/../.."
W=~/.decomp-buddy-smoke/whatsnew; rm -rf $W; mkdir -p $W/up $W/fresh $W/lib
cat > $W/up/settings.json <<JSON
{"installDir":"$W/lib","sawLegal":true,"sawWhere":true,"countSetups":false,"lastVersion":"0.30.7","launches":5,"nudgedAt":[3,7,10,20,30,40,50,60,70,80,90,100]}
JSON
fail=0
for mode in upgrade fresh; do
  P=$W/up; [ $mode = fresh ] && P=$W/fresh
  { echo "window.SMOKE_EXPECT = '$mode';"; cat scripts/smoke/whatsnew.js; } > $W/$mode.js
  OUT=$(SMOKE_TIMEOUT=${SMOKE_TIMEOUT:-60000} scripts/smoke.sh $W/$mode.js $P 2>&1 || true)
  R=$(print -r -- "$OUT" | sed -n '/^RESULT/,$p' | tr -d '\n' ); [ -n "$R" ] || R="RESULT-ERROR no result ($mode)"
  print -r -- "$mode: $R"
  print -r -- "$R" | grep -q '"ok":true' || fail=1
done
exit $fail
