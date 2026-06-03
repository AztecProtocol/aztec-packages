#!/usr/bin/env bash
# Bounded high-memory MSM gate runner.
# Usage: bash run_gate.sh <logn> <profile> [runs=5] [reps=5] [extra_query]
# Runs the high-memory bench `runs` times; counts cross-check agreements and
# prints the metered scratch_mb. Prints GATE_RESULT=green only if every run
# agreed and none disagreed/errored.
set -u
LOGN="${1:?logn}"
PROFILE="${2:?profile}"
RUNS="${3:-5}"
REPS="${4:-5}"
EXTRA="${5:-}"
PROFDIR="$HOME/localclaudebox/wt-structure-profile"
URL="http://127.0.0.1:5198/dev/msm-webgpu/index.html?coi=1&autorun=msm-bench&logn=${LOGN}&reps=${REPS}&scalar_dist=profile&profile=${PROFILE}&msm=highmem${EXTRA}"

agree=0
bad=0
last_mb=""
for i in $(seq 1 "$RUNS"); do
  out="$(timeout 300 node dev/msm-webgpu/drive-persist.mjs "$URL" "$PROFDIR" 2>&1)"
  if echo "$out" | grep -q 'WebGPU and WASM MT agree'; then
    agree=$((agree+1))
  else
    bad=$((bad+1))
    echo "  RUN $i NO-AGREE:"
    echo "$out" | grep -iE 'disagree|mismatch|error|fail|cross-check' | head -5
  fi
  mb="$(echo "$out" | grep -oE 'scratch_mb=[0-9.]+' | head -1)"
  [ -n "$mb" ] && last_mb="$mb"
  echo "  run $i/$RUNS: agree=$agree bad=$bad $mb"
done
echo "GATE logn=$LOGN profile=$PROFILE runs=$RUNS: agree=$agree bad=$bad ${last_mb}"
if [ "$agree" -eq "$RUNS" ] && [ "$bad" -eq 0 ]; then
  echo "GATE_RESULT=green logn=$LOGN profile=$PROFILE ${last_mb}"
else
  echo "GATE_RESULT=RED logn=$LOGN profile=$PROFILE ${last_mb}"
fi
