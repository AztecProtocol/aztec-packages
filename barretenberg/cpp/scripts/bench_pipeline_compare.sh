#!/usr/bin/env bash
# Comparative A/B benchmark for the chonk Phase A/B pipelining optimization.
#
# For each given flow, runs N iterations in each mode (baseline = NO_PIPELINE=1,
# pipelined = default) and reports median + range of wall time and peak RSS.
# The metric shape matches what the CI dashboard publishes:
#   - wall_ms : measured around `bb prove ...`
#   - peak_mb : via ci3/memusage wrapper (ps -o rss= sampled every 100ms, max-tracked).
#     This is the same `memusage` wrapper ci_benchmark_ivc_flows.sh uses, so numbers
#     produced here are directly comparable to the `app-proving/.../native/memory` entries
#     on https://aztecprotocol.github.io/benchmark-page-data/bench/?branch=prs
#
# Requires NO_PIPELINE env-var toggle in PrivateExecutionSteps::accumulate (present on
# the lde/precomputed-circuits branch). If that toggle isn't in your tree, the "baseline"
# runs will still pipeline and the A/B is meaningless.
#
# Usage (run from repo root):
#   barretenberg/cpp/scripts/bench_pipeline_compare.sh [OPTIONS]
#
# Options:
#   --flows "a b c"     Space-separated flow names (subdirs of example-app-ivc-inputs-out).
#                       Default: all flows present on disk.
#   --runs N            Runs per (flow, mode). Default: 3. First run per mode is always
#                       discarded as warmup, so you get N-1 measured runs unless --no-warmup.
#   --no-warmup         Keep the first run instead of discarding it.
#   --cpus N            HARDWARE_CONCURRENCY and taskset -c 0-(N-1). Default: 8.
#   --bb PATH           bb binary. Default: ./barretenberg/cpp/build/bin/bb
#   --inputs-dir PATH   Directory containing <flow>/ivc-inputs.msgpack subdirs.
#                       Default: ./yarn-project/end-to-end/example-app-ivc-inputs-out
#   --out-dir PATH      Output directory for per-run logs and CSV.
#                       Default: /tmp/bench-pipeline-<timestamp>
#   --modes "list"      Space-separated mode labels. Default: "baseline pipelined".
#                       Valid modes: baseline, pipelined, baseline-trim, pipelined-trim.
#                       The -trim variants run with NO_TRIM unset (requires the
#                       malloc_trim(0) call in the accumulate loop).
#   -h, --help          Show this help.
#
# Examples:
#   # Default: all flows, 3 runs each (2 measured + 1 warmup), 8 cores, baseline vs pipelined
#   barretenberg/cpp/scripts/bench_pipeline_compare.sh
#
#   # Just AMM and storage_proof, 5 runs, 32 cores
#   barretenberg/cpp/scripts/bench_pipeline_compare.sh \
#     --flows "ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc ecdsar1+storage_proof_7_layers+sponsored_fpc" \
#     --runs 5 --cpus 32
#
#   # Four-way comparison including trim variants
#   barretenberg/cpp/scripts/bench_pipeline_compare.sh \
#     --modes "baseline pipelined baseline-trim pipelined-trim"

set -euo pipefail

FLOWS=""
RUNS=3
WARMUP=1
CPUS=8
BB="./barretenberg/cpp/build/bin/bb"
INPUTS_DIR="./yarn-project/end-to-end/example-app-ivc-inputs-out"
OUT_DIR="/tmp/bench-pipeline-$(date +%s)"
MODES="baseline pipelined"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MEMUSAGE="$REPO_ROOT/ci3/memusage"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --flows)      FLOWS="$2"; shift 2 ;;
    --runs)       RUNS="$2"; shift 2 ;;
    --no-warmup)  WARMUP=0; shift ;;
    --cpus)       CPUS="$2"; shift 2 ;;
    --bb)         BB="$2"; shift 2 ;;
    --inputs-dir) INPUTS_DIR="$2"; shift 2 ;;
    --out-dir)    OUT_DIR="$2"; shift 2 ;;
    --modes)      MODES="$2"; shift 2 ;;
    -h|--help)    sed -n '2,/^set -euo/p' "$0" | grep '^#' | sed 's/^# \?//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# Sanity checks.
if [[ ! -x "$BB" ]]; then
  echo "bb binary not found or not executable: $BB" >&2
  echo "Build it with: (cd barretenberg/cpp && cmake --preset clang20 && cmake --build build --target bb)" >&2
  exit 1
fi
if [[ ! -d "$INPUTS_DIR" ]]; then
  echo "Inputs directory not found: $INPUTS_DIR" >&2
  echo "Populate it with: ./yarn-project/end-to-end/bootstrap.sh build_bench" >&2
  exit 1
fi
if [[ ! -x "$MEMUSAGE" ]]; then
  echo "memusage helper not found: $MEMUSAGE" >&2
  exit 1
fi

# Default flow list = every subdirectory with an ivc-inputs.msgpack.
if [[ -z "$FLOWS" ]]; then
  FLOWS=""
  for d in "$INPUTS_DIR"/*/; do
    flow=$(basename "$d")
    if [[ -f "$d/ivc-inputs.msgpack" ]]; then
      FLOWS+="$flow "
    fi
  done
  FLOWS=${FLOWS% }
fi

# Translate mode label to env-var prefix.
# baseline        = NO_PIPELINE=1 NO_TRIM=1
# pipelined       = NO_TRIM=1 (pipeline on, trim off)
# baseline-trim   = NO_PIPELINE=1 (pipeline off, trim on)
# pipelined-trim  = (both on)
function mode_env() {
  case "$1" in
    baseline)       echo "NO_PIPELINE=1 NO_TRIM=1" ;;
    pipelined)      echo "NO_TRIM=1" ;;
    baseline-trim)  echo "NO_PIPELINE=1" ;;
    pipelined-trim) echo "" ;;
    *) echo "Unknown mode: $1" >&2; exit 1 ;;
  esac
}

mkdir -p "$OUT_DIR"
RESULTS_CSV="$OUT_DIR/results.csv"
echo "flow,mode,run,warmup,wall_ms,peak_mb" > "$RESULTS_CSV"

# Run one iteration: prints + appends to CSV.
# $1 flow  $2 mode  $3 run#  $4 is_warmup (0/1)
function run_one() {
  local flow=$1 mode=$2 run=$3 warmup=$4
  local inputs="$INPUTS_DIR/$flow/ivc-inputs.msgpack"
  local run_dir="$OUT_DIR/$flow/$mode/run$run"
  mkdir -p "$run_dir"
  local peak_file="$run_dir/peak.txt"
  local env_prefix
  env_prefix=$(mode_env "$mode")

  # Precise wall measured around the whole bb invocation.
  local start_ns end_ns
  start_ns=$(date +%s%N)

  # shellcheck disable=SC2086
  env HARDWARE_CONCURRENCY=$CPUS MEMUSAGE_OUT="$peak_file" $env_prefix \
    "$MEMUSAGE" taskset -c "0-$((CPUS-1))" \
    "$BB" prove \
      -o "$run_dir" \
      --ivc_inputs_path "$inputs" \
      --scheme chonk \
    >"$run_dir/stdout.log" 2>"$run_dir/stderr.log" || {
      echo "  FAILED: $flow [$mode] run $run — see $run_dir/stderr.log" >&2
      return 1
    }

  end_ns=$(date +%s%N)
  local wall_ms=$(( (end_ns - start_ns) / 1000000 ))
  local peak_mb=0
  [[ -f "$peak_file" ]] && peak_mb=$(cat "$peak_file")

  local marker="     "
  [[ "$warmup" -eq 1 ]] && marker="[warm]"
  printf "  %-14s run %d %s  %6d ms  %5d MB\n" "$mode" "$run" "$marker" "$wall_ms" "$peak_mb"

  echo "$flow,$mode,$run,$warmup,$wall_ms,$peak_mb" >> "$RESULTS_CSV"
}

echo "bench_pipeline_compare starting"
echo "  bb:         $BB"
echo "  inputs:     $INPUTS_DIR"
echo "  out:        $OUT_DIR"
echo "  cpus:       $CPUS"
echo "  runs/mode:  $RUNS (warmup=$WARMUP)"
echo "  modes:      $MODES"
echo "  flows:      $(echo "$FLOWS" | wc -w | tr -d ' ') flow(s)"
echo

for flow in $FLOWS; do
  if [[ ! -f "$INPUTS_DIR/$flow/ivc-inputs.msgpack" ]]; then
    echo "Skipping $flow (no ivc-inputs.msgpack)"
    continue
  fi
  echo "=== $flow ==="
  for mode in $MODES; do
    for run in $(seq 1 "$RUNS"); do
      is_warmup=0
      if [[ "$WARMUP" -eq 1 && "$run" -eq 1 ]]; then
        is_warmup=1
      fi
      run_one "$flow" "$mode" "$run" "$is_warmup" || true
    done
  done
done

echo
echo "Raw results: $RESULTS_CSV"
echo

# Summarize.
python3 - "$RESULTS_CSV" "$WARMUP" <<'PYEOF'
import csv, sys
from statistics import median, stdev
from collections import defaultdict

csv_path, warmup_enabled = sys.argv[1], int(sys.argv[2])

# data[flow][mode] = [(wall_ms, peak_mb), ...]   (warmup runs excluded)
data = defaultdict(lambda: defaultdict(list))
with open(csv_path) as f:
    for row in csv.DictReader(f):
        if warmup_enabled and int(row["warmup"]) == 1:
            continue
        data[row["flow"]][row["mode"]].append(
            (int(row["wall_ms"]), int(row["peak_mb"]))
        )

def fmt_range(vals):
    return f"{min(vals)}-{max(vals)}"

def pct(delta, base):
    return f"{100.0 * delta / base:+.1f}%" if base else "n/a"

print("## Summary")
print()
hdr = ("flow", "mode", "wall_ms med", "wall range", "peak_mb med", "peak range")
widths = (48, 16, 12, 14, 12, 14)
def row(*cells):
    print("| " + " | ".join(str(c).ljust(w) for c, w in zip(cells, widths)) + " |")
def sep():
    print("|" + "|".join("-" * (w + 2) for w in widths) + "|")

row(*hdr); sep()

for flow in sorted(data):
    modes = data[flow]
    # Pick a reference mode for delta (first listed that has data).
    mode_order = ["baseline", "pipelined", "baseline-trim", "pipelined-trim"]
    present_modes = [m for m in mode_order if m in modes]
    ref_mode = present_modes[0] if present_modes else None

    for mode in present_modes:
        runs = modes[mode]
        walls = [r[0] for r in runs]
        mems = [r[1] for r in runs]
        wm, mm = int(median(walls)), int(median(mems))
        row(flow[:48], mode, wm, fmt_range(walls), mm, fmt_range(mems))

    # Deltas vs ref_mode
    if ref_mode and len([m for m in present_modes if m != ref_mode]) > 0:
        rw = int(median(r[0] for r in modes[ref_mode]))
        rm = int(median(r[1] for r in modes[ref_mode]))
        for mode in present_modes:
            if mode == ref_mode: continue
            mw = int(median(r[0] for r in modes[mode]))
            mmm = int(median(r[1] for r in modes[mode]))
            dw, dm = mw - rw, mmm - rm
            row(
                "  └─ Δ " + mode + " vs " + ref_mode, "",
                f"{dw:+d}", pct(dw, rw), f"{dm:+d}", pct(dm, rm),
            )
    print()  # blank between flows

print()
print("Reference mode for deltas: first-listed mode present in each flow.")
print(f"Warmup runs excluded: {bool(warmup_enabled)}")
print(f"Raw CSV: {csv_path}")
PYEOF
