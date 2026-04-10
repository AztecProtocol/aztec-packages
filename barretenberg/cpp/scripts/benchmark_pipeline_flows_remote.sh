#!/usr/bin/env bash
# Benchmark chonk pipelining (Phase A/B split) on the remote EC2 instance,
# across multiple IVC flows and construction modes, in one shot.
#
# Runs N iterations per (flow, mode) and prints a markdown summary table
# of wall time and peak RSS (via /usr/bin/time %e / %M, which is getrusage
# max_rss in KB — the same metric the CI dashboard publishes via memusage).
#
# Modes (settable via --modes):
#   baseline        NO_PIPELINE=1 NO_TRIM=1   (pipeline off, trim off)
#   pipelined       NO_TRIM=1                 (pipeline on,  trim off)
#   baseline-trim   NO_PIPELINE=1             (pipeline off, trim on)
#   pipelined-trim  (none)                    (pipeline on,  trim on)
#
# Usage:
#   ./scripts/benchmark_pipeline_flows_remote.sh [OPTIONS]
#
# Options (all optional; defaults in [brackets]):
#   --flows "A B C"   Space-separated flow names. [a 4-flow representative subset]
#   --runs N          Runs per (flow, mode). First run is warmup. [4]
#   --modes "M1 M2"   Modes to compare. [baseline pipelined]
#   --target NAME     Binary target name to build and ship. [bb]
#
# Prerequisites (same as benchmark_remote.sh / benchmark_example_ivc_flow_remote.sh):
#   BB_SSH_KEY, BB_SSH_INSTANCE, BB_SSH_CPP_PATH env vars.
#   yarn-project/end-to-end/example-app-ivc-inputs-out/<flow>/ivc-inputs.msgpack
#     (run test_chonk_standalone_vks_havent_changed.sh --download_pinned_inputs first).
#   The branch being benched must include the NO_PIPELINE / NO_TRIM env-var gating
#   in PrivateExecutionSteps::accumulate — otherwise the "baseline" arm will still
#   pipeline and the comparison is meaningless.
set -eu

TARGET="bb"
RUNS=4
MODES="baseline pipelined baseline-trim pipelined-trim"
FLOWS="ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --flows)  FLOWS="$2";  shift 2 ;;
    --runs)   RUNS="$2";   shift 2 ;;
    --modes)  MODES="$2";  shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    -h|--help) sed -n '2,/^set -eu/p' "$0" | grep '^#' | sed 's/^# \?//'; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

BUILD_DIR="build"
INPUTS_DIR="../../yarn-project/end-to-end/example-app-ivc-inputs-out"
LOG_FILE="/tmp/benchmark_pipeline_flows_remote.log"

# Move above script dir (we should be at barretenberg/cpp now).
cd "$(dirname "$0")/.."

# --- 1. Upload inputs for each flow to the remote build dir. ---
echo "Uploading msgpack inputs for $(echo "$FLOWS" | wc -w | tr -d ' ') flow(s)..."
for flow in $FLOWS; do
  src="$INPUTS_DIR/$flow/ivc-inputs.msgpack"
  if [[ ! -f "$src" ]]; then
    echo "  MISSING: $src" >&2
    echo "  Run: ./scripts/test_chonk_standalone_vks_havent_changed.sh --download_pinned_inputs" >&2
    exit 1
  fi
  # Flow names contain + and _ which are safe in POSIX filenames.
  scp $BB_SSH_KEY "$src" \
    "$BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/ivc-inputs-${flow}.msgpack" >/dev/null
  echo "  $flow"
done

# --- 2. Compose the remote command. ---
# Trick: use an UNQUOTED heredoc so local variables ($FLOWS, $RUNS, $MODES, $TARGET)
# are expanded here, but remote-side variables ($flow, $mode, $run, etc.) stay literal
# because we prefix their $ with a backslash. The resulting string contains a mix of
# already-substituted values (flow list, run count) and literal $ references (loop
# iterators) that the remote bash will evaluate once ssh delivers them.
REMOTE_CMD=$(cat <<EOF
set -u
FLOWS="$FLOWS"
RUNS=$RUNS
MODES="$MODES"
BB=./$TARGET

echo "# === BENCH START (flow, mode, run, warmup, wall_s, peak_kb) ==="
for flow in \$FLOWS; do
  inputs="ivc-inputs-\${flow}.msgpack"
  if [ ! -f "\$inputs" ]; then
    echo "BENCH_SKIP \$flow (missing \$inputs)" >&2
    continue
  fi
  for mode in \$MODES; do
    case "\$mode" in
      baseline)       env_prefix="NO_PIPELINE=1 NO_TRIM=1" ;;
      pipelined)      env_prefix="NO_TRIM=1" ;;
      baseline-trim)  env_prefix="NO_PIPELINE=1" ;;
      pipelined-trim) env_prefix="" ;;
      *) echo "Unknown mode: \$mode" >&2; exit 1 ;;
    esac
    for run in \$(seq 1 \$RUNS); do
      warmup=0
      [ "\$run" -eq 1 ] && warmup=1
      # /usr/bin/time writes "<wall_s>,<max_rss_kb>" to a file so we don't have to
      # wrestle with stderr capture inside a subshell. bb's own stdout/stderr are
      # suppressed so the output is clean.
      /usr/bin/time -f '%e,%M' -o /tmp/bench-time.out \\
        env \$env_prefix "\$BB" prove \\
          --scheme chonk \\
          --ivc_inputs_path "\$inputs" \\
          -o /tmp/bench-out \\
        >/dev/null 2>&1 || {
          echo "BENCH_FAIL \$flow,\$mode,\$run" >&2
          continue
        }
      timing=\$(cat /tmp/bench-time.out)
      echo "BENCH \$flow,\$mode,\$run,\$warmup,\$timing"
    done
  done
done
echo "# === BENCH END ==="
EOF
)

# --- 3. Run via benchmark_remote.sh. It builds the target locally, scps the binary
#        to the remote, then ssh-execs the command. Output is streamed to the terminal
#        and captured to LOG_FILE for post-processing.
echo
echo "Running bench on remote via benchmark_remote.sh (build + scp + ssh)..."
echo
./scripts/benchmark_remote.sh "$TARGET" "$REMOTE_CMD" clang20-no-avm "$BUILD_DIR" 2>&1 | tee "$LOG_FILE"

# --- 4. Summarize results from the captured log. ---
echo
echo "=== SUMMARY ==="
grep '^BENCH ' "$LOG_FILE" | sed 's/^BENCH //' | python3 - <<'PYEOF'
import sys
from collections import defaultdict, OrderedDict
from statistics import median

# data[flow][mode] = [(wall_s, peak_mb), ...]   (warmup runs excluded)
data = OrderedDict()
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    parts = line.split(',')
    if len(parts) != 6:
        continue
    flow, mode, run, warmup, wall_s, peak_kb = parts
    if int(warmup) == 1:
        continue  # drop warmup
    data.setdefault(flow, OrderedDict()).setdefault(mode, []).append(
        (float(wall_s), int(peak_kb) / 1024.0)
    )

if not data:
    print("No measured runs found in log.")
    sys.exit(0)

def fmt_range(vals, fmt):
    return f"{fmt.format(min(vals))} – {fmt.format(max(vals))}"

# Column widths
W = (48, 16, 11, 17, 11, 17)
hdr = ("flow", "mode", "wall_s med", "wall range", "peak_MB med", "peak range")

def row(cells):
    print("| " + " | ".join(str(c).ljust(w) for c, w in zip(cells, W)) + " |")

def sep():
    print("|" + "|".join("-" * (w + 2) for w in W) + "|")

row(hdr)
sep()

for flow, modes in data.items():
    # Determine a reference mode for delta rows. Prefer in this order:
    order = ["baseline", "pipelined", "baseline-trim", "pipelined-trim"]
    present = [m for m in order if m in modes]
    ref = present[0] if present else None

    for mode in present:
        runs = modes[mode]
        walls = [r[0] for r in runs]
        mems = [r[1] for r in runs]
        row((flow[:48], mode,
             f"{median(walls):.2f}",
             fmt_range(walls, "{:.2f}"),
             f"{median(mems):.0f}",
             fmt_range(mems, "{:.0f}")))

    if ref and len(present) > 1:
        rw = median(r[0] for r in modes[ref])
        rm = median(r[1] for r in modes[ref])
        for mode in present:
            if mode == ref:
                continue
            mw = median(r[0] for r in modes[mode])
            mmm = median(r[1] for r in modes[mode])
            dw = mw - rw
            dm = mmm - rm
            dwp = f"{100 * dw / rw:+.1f}%" if rw else "n/a"
            dmp = f"{100 * dm / rm:+.1f}%" if rm else "n/a"
            row((
                "  └─ Δ " + mode + " vs " + ref, "",
                f"{dw:+.2f}", dwp,
                f"{dm:+.0f}", dmp,
            ))
    sep()

print()
print("Peak MB is from /usr/bin/time %M (getrusage max_rss, KB), converted to MB.")
print("Warmup runs (run #1 per mode) excluded.")
print("Raw log: /tmp/benchmark_pipeline_flows_remote.log")
PYEOF
