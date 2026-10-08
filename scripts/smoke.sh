#!/bin/zsh
# Run a headless smoke (see scripts/smoke.mjs). Refuses to start Electron unless the harness and
# the script both exist - Electron pointed at a missing file shows an error box on screen.
set -u
cd "$(dirname "$0")/.."
H=scripts/smoke.mjs
[[ -f $H ]] || { echo "RESULT-ERROR harness missing: $H"; exit 4; }
[[ $# -ge 2 && -f $1 ]] || { echo "RESULT-ERROR usage: scripts/smoke.sh <renderer-script.js> <profileDir>"; exit 4; }
case "$2" in */Library/Application\ Support/*) echo "RESULT-ERROR refusing a real app profile: $2"; exit 4;; esac
# DECOMP_NO_LAUNCH: Play is a dry run - a smoke must never start a game (or a fake one) on this Mac.
DECOMP_HEADLESS=1 DECOMP_NO_LAUNCH=1 exec npx electron "$H" "$1" "$2"
