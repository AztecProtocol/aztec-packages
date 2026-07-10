#!/usr/bin/env bash
# Replay a captured set of real proving jobs through bb, timing each stage.
#
# The capture is produced by running any real-proof yarn-project test with
# BB_DEBUG_OUTPUT_DIR set (e.g. e2e_prover/full). Every server-side proving job
# (AVM proofs, chonk verifier, parity, base/merge/checkpoint/root rollups) is dumped
# to a numbered directory containing its inputs and a command.sh with the exact bb
# CLI invocation. This script replays those jobs — the pure-barretenberg equivalent
# of "prove N transactions all the way to the root rollup" with no node, orchestrator,
# or witness generation in the loop.
#
# Usage: replay_prover_bench.sh <capture_dir> [options]
#   -b <path>   bb binary to replay with (default: build/bin/bb relative to bb cpp root)
#   -j <N>      number of concurrent chains — each chain replays the full job set (default 1)
#   -g          enable GPU MSM dispatch (BB_MSM_GPU=1; binary must link ecc_gpu)
#   -m <size>   BB_MSM_GPU_MIN_SIZE override (implies nothing about -g)
#   -s          collect per-job MSM stats (BB_MSM_STATS=1) and report MSM share
#   -t <N>      threads per bb process (HARDWARE_CONCURRENCY; default: all cores)
#   -f <regex>  only replay jobs whose directory name matches regex
#   -V          also replay verify-* jobs (skipped by default)
#   -o <dir>    results directory (default: <capture_dir>/replay-results-<timestamp>)
set -euo pipefail

cd "$(dirname "$0")/.."

CAPTURE_DIR="${1:-}"
[ -n "$CAPTURE_DIR" ] && shift || { echo "usage: $0 <capture_dir> [options]" >&2; exit 1; }
CAPTURE_DIR=$(realpath "$CAPTURE_DIR")

BB_BIN="$PWD/build/bin/bb"
CHAINS=1
GPU=0
MSM_STATS=0
THREADS=""
FILTER=""
INCLUDE_VERIFY=0
RESULTS_DIR=""
GPU_MIN_SIZE=""

while getopts "b:j:gm:st:f:Vo:" opt; do
  case "$opt" in
    b) BB_BIN=$(realpath "$OPTARG") ;;
    j) CHAINS="$OPTARG" ;;
    g) GPU=1 ;;
    m) GPU_MIN_SIZE="$OPTARG" ;;
    s) MSM_STATS=1 ;;
    t) THREADS="$OPTARG" ;;
    f) FILTER="$OPTARG" ;;
    V) INCLUDE_VERIFY=1 ;;
    o) RESULTS_DIR=$(realpath -m "$OPTARG") ;;
    *) exit 1 ;;
  esac
done

[ -x "$BB_BIN" ] || { echo "bb binary not executable: $BB_BIN" >&2; exit 1; }
[ -n "$RESULTS_DIR" ] || RESULTS_DIR="$CAPTURE_DIR/replay-results-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RESULTS_DIR"

# Enumerate replayable jobs in captured dispatch order.
jobs=()
for dir in "$CAPTURE_DIR"/[0-9]*/; do
  dir=${dir%/}
  name=$(basename "$dir")
  [ -f "$dir/command.sh" ] || continue
  case "$name" in
    *-verify-*|*-avm-verify-*) [ "$INCLUDE_VERIFY" = 1 ] || continue ;;
    *-gates-*|*-avm-check-circuit-*) continue ;;
  esac
  if [ -n "$FILTER" ] && ! [[ "$name" =~ $FILTER ]]; then continue; fi
  jobs+=("$dir")
done
[ "${#jobs[@]}" -gt 0 ] || { echo "no replayable jobs found in $CAPTURE_DIR" >&2; exit 1; }

echo "Replaying ${#jobs[@]} jobs x $CHAINS chain(s) with $BB_BIN (GPU=$GPU)"
echo "Results: $RESULTS_DIR"

# Strip the ordering prefix and pid suffix from a job dir name to get its type,
# e.g. 0042-rollup-base-public-pid123 -> rollup-base-public.
job_type() {
  basename "$1" | sed -E 's/^[0-9]+-//; s/-pid[0-9]+$//'
}

# Sum BN254+Grumpkin single+batch MSM ms from a BB_MSM_STATS stderr dump.
msm_ms_from_log() {
  { grep -oE 'total_ms=[0-9.]+' "$1" 2>/dev/null || true; } | awk -F= '{ s += $2 } END { printf "%.1f", s }'
}

run_chain() {
  local chain_id=$1
  local csv="$RESULTS_DIR/chain-$chain_id.csv"
  echo "order,job,wall_s,msm_ms" > "$csv"
  local order=0
  for dir in "${jobs[@]}"; do
    order=$((order + 1))
    local name type out_dir log cmd
    name=$(basename "$dir")
    type=$(job_type "$dir")
    out_dir="$RESULTS_DIR/chain-$chain_id/$name"
    log="$out_dir/replay.log"
    mkdir -p "$out_dir"
    # command.sh line 2 holds the exact CLI. Swap in our binary and a fresh -o dir, and
    # remap input paths from the capture-time job dir to its current location so a
    # capture can be copied to another machine.
    cmd=$(sed -n 2p "$dir/command.sh")
    set -- $cmd
    shift # drop the captured binary path
    local raw=("$@")
    local orig_dir=""
    local i
    for ((i = 0; i < ${#raw[@]}; i++)); do
      [ "${raw[$i]}" = "-o" ] && orig_dir="${raw[$((i + 1))]}"
    done
    local args=()
    for ((i = 0; i < ${#raw[@]}; i++)); do
      local a="${raw[$i]}"
      if [ "$a" = "-o" ]; then
        args+=("-o" "$out_dir")
        i=$((i + 1))
        continue
      fi
      [ -n "$orig_dir" ] && a="${a/#"$orig_dir"/$dir}"
      args+=("$a")
    done
    local envs=()
    [ -n "$THREADS" ] && envs+=("HARDWARE_CONCURRENCY=$THREADS")
    [ "$GPU" = 1 ] && envs+=("BB_MSM_GPU=1")
    [ -n "$GPU_MIN_SIZE" ] && envs+=("BB_MSM_GPU_MIN_SIZE=$GPU_MIN_SIZE")
    [ "$MSM_STATS" = 1 ] && envs+=("BB_MSM_STATS=1")
    local t0 t1
    t0=$(date +%s.%N)
    if ! env "${envs[@]}" "$BB_BIN" "${args[@]}" > "$log" 2>&1; then
      echo "FAILED: chain $chain_id job $name (log: $log)" >&2
      echo "$order,$name,FAILED,0" >> "$csv"
      continue
    fi
    t1=$(date +%s.%N)
    local wall msm suffix
    wall=$(awk -v a="$t0" -v b="$t1" 'BEGIN { printf "%.2f", b - a }')
    msm=0
    suffix=""
    if [ "$MSM_STATS" = 1 ]; then
      msm=$(msm_ms_from_log "$log")
      suffix=" (msm ${msm}ms)"
    fi
    echo "$order,$name,$wall,$msm" >> "$csv"
    echo "  chain $chain_id [$order/${#jobs[@]}] $type: ${wall}s$suffix"
  done
}

overall_t0=$(date +%s.%N)
pids=()
for c in $(seq 1 "$CHAINS"); do
  run_chain "$c" &
  pids+=($!)
done
fail=0
for pid in "${pids[@]}"; do wait "$pid" || fail=1; done
overall_t1=$(date +%s.%N)
overall=$(awk -v a="$overall_t0" -v b="$overall_t1" 'BEGIN { printf "%.2f", b - a }')

echo
echo "=== Replay summary (binary: $BB_BIN, GPU=$GPU, chains=$CHAINS, threads=${THREADS:-all}) ==="
awk -F, '
  FNR == 1 { next }
  $3 == "FAILED" { failed++; next }
  {
    name = $2; sub(/^[0-9]+-/, "", name); sub(/-pid[0-9]+$/, "", name)
    count[name]++; wall[name] += $3; msm[name] += $4
    total_wall += $3; total_msm += $4; total_jobs++
  }
  END {
    printf "%-40s %5s %10s %10s %10s\n", "job type", "count", "total_s", "mean_s", "msm_ms"
    for (name in count) {
      printf "%-40s %5d %10.2f %10.2f %10.1f\n", name, count[name], wall[name], wall[name]/count[name], msm[name]
    }
    printf "%-40s %5d %10.2f %10s %10.1f\n", "TOTAL (sum of job walls)", total_jobs, total_wall, "", total_msm
    if (total_wall > 0 && total_msm > 0) {
      printf "MSM share of job wall time: %.1f%%\n", (total_msm / 1000) / total_wall * 100
    }
    if (failed > 0) { printf "FAILED JOBS: %d\n", failed }
  }
' "$RESULTS_DIR"/chain-*.csv
echo "Overall wall (all chains): ${overall}s"
[ "$fail" = 0 ]
