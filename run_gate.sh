#!/usr/bin/env bash
# Usage: run_gate.sh <logn> <profile> <runs> [reps] [extra_qs]
# Runs the highmem bench <runs> times (independent page loads). Prints per-run
# agree/disagree + the scratch_bytes line, then a GATE summary.
set -u
LOGN="$1"; PROF="$2"; RUNS="${3:-5}"; REPS="${4:-5}"; EXTRA="${5:-}"
PROFILE_DIR="$HOME/localclaudebox/wt-structure-profile"
URL="http://127.0.0.1:5198/dev/msm-webgpu/index.html?coi=1&autorun=msm-bench&logn=${LOGN}&reps=${REPS}&scalar_dist=profile&profile=${PROF}&msm=highmem${EXTRA}"
agree_total=0; disagree_total=0; bad=0; scratch=""
for i in $(seq 1 "$RUNS"); do
  OUT=$(timeout 360 node dev/msm-webgpu/drive-persist.mjs "$URL" "$PROFILE_DIR" 2>&1)
  a=$(echo "$OUT" | grep -c 'cross-check] WebGPU and WASM MT agree')
  d=$(echo "$OUT" | grep -c 'cross-check.*disagree')
  s=$(echo "$OUT" | grep -oE 'scratch_bytes=[0-9]+ scratch_mb=[0-9.]+' | head -1)
  done_ok=$(echo "$OUT" | grep -c 'bench] DONE')
  fatal=$(echo "$OUT" | grep -c 'FATAL\|state=error')
  [ -n "$s" ] && scratch="$s"
  agree_total=$((agree_total+a)); disagree_total=$((disagree_total+d))
  if [ "$a" -lt 1 ] || [ "$d" -ne 0 ] || [ "$done_ok" -lt 1 ] || [ "$fatal" -ne 0 ]; then
    bad=$((bad+1)); echo "  run $i: agree=$a disagree=$d done=$done_ok fatal=$fatal  [BAD]"
    echo "$OUT" | grep -E 'FATAL|disagree|state=error' | head -3
  else
    echo "  run $i: agree=$a disagree=$d done=$done_ok  $s  [OK]"
  fi
done
echo "GATE logn=$LOGN profile=$PROF runs=$RUNS: agree_total=$agree_total disagree_total=$disagree_total bad_runs=$bad  $scratch"
[ "$bad" -eq 0 ] && [ "$disagree_total" -eq 0 ] && echo "GATE_RESULT=GREEN" || echo "GATE_RESULT=RED"
