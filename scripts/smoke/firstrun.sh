#!/bin/zsh
# First run on a fresh computer, three ways: a normal network, no network, and one where nothing ever answers.
# No GitHub key, no saved anything, not the admin's Mac. Fails if Browse or Coming Soon take more than a few seconds,
# if covers are missing, or (on a normal network) if starting up asks GitHub's API anything at all.
set -u
cd "$(dirname "$0")/../.."
[[ -s app-catalog.json && -s waiting.json ]] || { echo "✗ app-catalog.json / waiting.json missing - copy them from the site (scripts/release.sh does)"; exit 1; }
fail=0
for mode in online offline slow; do
  P=$(mktemp -d -t db-firstrun); LOG="$P/net.log"; : > "$LOG"
  extra=(); [[ $mode == offline ]] && extra=(DECOMP_OFFLINE=1); [[ $mode == slow ]] && extra=(DECOMP_SLOW=1)
  r=$(env -u GITHUB_TOKEN DECOMP_SITE_DIR=/nonexistent DECOMP_NETLOG="$LOG" SMOKE_TIMEOUT=90000 "${extra[@]}" scripts/smoke.sh scripts/smoke/firstrun.js "$P/profile" 2>/dev/null | sed -n '/^RESULT/,$p')
  gh=$(grep -c '^https://api.github.com/' "$LOG")
  ok=$([[ $r == *'"ok": true'* ]] && echo yes || echo no)
  [[ $mode == online && $gh -gt 0 ]] && ok=no
  echo "$mode: ok=$ok github_api_lookups=$gh $(echo "$r" | tr -d '\n ' | grep -oE '"(secondsToGames|games|withArt|soonRows|secondsToSoon)":[0-9.]+' | tr '\n' ' ')"
  [[ $ok == yes ]] || { fail=1; echo "$r" | head -30; grep '^https://api.github.com/' "$LOG" | head -5; }
  rm -rf "$P"
done
exit $fail
