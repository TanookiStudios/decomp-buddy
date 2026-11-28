#!/bin/zsh
# Runs the perf smoke hidden on a throwaway profile and samples every Decomp Buddy process (main,
# renderer, GPU, network...) every 2 s: total CPU seconds used and memory (RSS) in MB.
cd "$(dirname "$0")/../.."
P=${1:-$HOME/.decomp-buddy-smoke/perf}; rm -rf "$P"
SMOKE_TIMEOUT=200000 scripts/smoke.sh scripts/smoke/perf.js "$P" > "$P.out" 2>&1 &
sleep 1
tree() { pgrep -f "scripts/smoke.mjs scripts/smoke/perf.js" | tr '\n' ','; pgrep -f "user-data-dir=$P|$P" | tr '\n' ','; }
for i in $(seq 1 60); do
  pids=$(ps -axo pid,ppid,command | awk -v p="$P" 'index($0,"smoke/perf.js")||index($0,p){print $1}' | tr '\n' ',' | sed 's/,$//')
  [ -z "$pids" ] && break
  ps -o time=,rss= -p "$pids" 2>/dev/null | awk -v t=$((i*2)) '{split($1,a,":"); s+=a[1]*60+a[2]; r+=$2} END{printf "%ds cpu=%.1fs ram=%dMB\n", t, s, r/1024}'
  sleep 2
done
wait; grep -A20 '^RESULT' "$P.out"
