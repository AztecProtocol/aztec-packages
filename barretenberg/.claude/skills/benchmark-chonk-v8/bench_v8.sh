#!/usr/bin/env bash
# V8/node (wasm) Chonk flow sweep via bb.js. Compares one or more "contexts" (typically two
# git commits, each built to a barretenberg.wasm.gz) over the pinned flows at one or more HC
# values, capturing internal prove time (PROVE_MS) and peak RSS. Contexts run back-to-back per
# (flow, hc, rep) so thermal drift cancels in the comparison. Resumable: skips rows already in CSV.
#
# Usage:
#   bench_v8.sh --hc "4 8" --reps 2 --flows-dir <dir> --out <csv> [--ts-dir <ts>] CTX [CTX ...]
# where each CTX is  label=wasmpath  and wasmpath is either:
#   default                       -> the bb.js packaged dest wasm (barretenberg/ts/dest/node/...)
#   /abs/path/barretenberg.wasm.gz -> a specific build (e.g. one commit's wasm-threads output)
#
# Example A/B of two commits A and B (build each first, see SKILL.md):
#   bench_v8.sh --hc "4 8" --reps 2 \
#     --flows-dir ~/aztec-packages/barretenberg/cpp/chonk-pinned-flows \
#     --out /tmp/v8ab/results.csv \
#     A=/tmp/wasm-A/barretenberg.wasm.gz B=/tmp/wasm-B/barretenberg.wasm.gz
set -u

HC_LIST="4 8"; REPS=2; FLOWS_DIR=""; OUT=""
TS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../ts" 2>/dev/null && pwd)"
CTXS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hc) HC_LIST="$2"; shift 2;;
    --reps) REPS="$2"; shift 2;;
    --flows-dir) FLOWS_DIR="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    --ts-dir) TS_DIR="$2"; shift 2;;
    *=*) CTXS+=("$1"); shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
[[ -n "$FLOWS_DIR" && -n "$OUT" && ${#CTXS[@]} -ge 1 ]] || { echo "missing --flows-dir/--out/contexts" >&2; exit 2; }

# Each run executes from $TS_DIR (cd below), so every path handed to the driver must be absolute —
# a relative --flows-dir or ctx wasm resolves against ts/ and fails ENOENT on every run.
abspath() { local d b; d="$(cd "$(dirname "$1")" 2>/dev/null && pwd)" && b="$(basename "$1")" && printf '%s/%s\n' "$d" "$b"; }
FLOWS_DIR="$(cd "$FLOWS_DIR" 2>/dev/null && pwd)" || { echo "flows-dir not found: $FLOWS_DIR" >&2; exit 2; }
for i in "${!CTXS[@]}"; do
  label="${CTXS[$i]%%=*}"; wasm="${CTXS[$i]#*=}"
  if [[ "$wasm" != "default" ]]; then
    wasm="$(abspath "$wasm")" && [[ -f "$wasm" ]] || { echo "ctx '$label' wasm not found: ${CTXS[$i]#*=}" >&2; exit 2; }
    CTXS[$i]="$label=$wasm"
  fi
done

DRIVER="$TS_DIR/scripts/bench_v8_flow.mjs"
[[ -f "$DRIVER" ]] || { echo "driver not found: $DRIVER" >&2; exit 2; }
mkdir -p "$(dirname "$OUT")"
[[ -f "$OUT" ]] || echo "context,hc,flow,rep,prove_ms,wall_ms,peak_mb,exit" > "$OUT"

# Flows = every subdir of FLOWS_DIR holding ivc-inputs.msgpack
mapfile -t FLOWS < <(cd "$FLOWS_DIR" && for d in */; do [[ -f "$d/ivc-inputs.msgpack" ]] && basename "$d"; done | sort)
[[ ${#FLOWS[@]} -ge 1 ]] || { echo "no flows with ivc-inputs.msgpack under $FLOWS_DIR" >&2; exit 2; }

ms() { python3 -c 'import time;print(int(time.time()*1000))'; }
have_row() { grep -q "^$1,$2,$3,$4," "$OUT"; }

run_one() { # label wasmpath hc flow rep
  local label=$1 wasm=$2 hc=$3 flow=$4 rep=$5
  local out; out="$(dirname "$OUT")/$label/hc$hc/$flow/rep$rep"; rm -rf "$out"; mkdir -p "$out"
  local wasm_arg=""; [[ "$wasm" != "default" ]] && wasm_arg="$wasm"
  local s e wall ec prove rss peak
  s=$(ms)
  ( cd "$TS_DIR" && env HARDWARE_CONCURRENCY=$hc /usr/bin/time -l \
      node "$DRIVER" "$FLOWS_DIR/$flow" "$hc" $wasm_arg ) >"$out/stdout.log" 2>"$out/time.log"
  ec=$?
  e=$(ms); wall=$((e - s))
  prove=$(grep -o 'PROVE_MS=[0-9]*' "$out/stdout.log" | head -1 | cut -d= -f2)
  rss=$(grep "maximum resident set size" "$out/time.log" | awk '{print $1}')
  peak=$(( ${rss:-0} / 1048576 ))
  echo "$label,$hc,$flow,$rep,${prove:-NA},$wall,$peak,$ec" >> "$OUT"
  printf '  [%s] hc%s rep%s %-50s prove=%6sms wall=%6sms %5sMB exit=%s\n' \
    "$label" "$hc" "$rep" "$flow" "${prove:-NA}" "$wall" "$peak" "$ec"
}

echo "V8 sweep start $(date) | contexts: ${CTXS[*]} | hc: $HC_LIST | reps: $REPS"
for flow in "${FLOWS[@]}"; do
  echo "=== $flow ==="
  for hc in $HC_LIST; do
    for ((rep=1; rep<=REPS; rep++)); do
      for ctx in "${CTXS[@]}"; do
        label="${ctx%%=*}"; wasm="${ctx#*=}"
        have_row "$label" "$hc" "$flow" "$rep" && { echo "  skip $label hc$hc rep$rep $flow"; continue; }
        run_one "$label" "$wasm" "$hc" "$flow" "$rep"
      done
    done
  done
done
fails=$(awk -F, 'NR>1 && $8!=0' "$OUT" | wc -l | tr -d ' ')
if [[ "$fails" -gt 0 ]]; then
  echo "WARNING: $fails run(s) exited non-zero (prove_ms=NA in CSV). Inspect stdout.log/time.log under $(dirname "$OUT")/<label>/hc<hc>/<flow>/rep<n>/" >&2
fi
echo "V8 sweep done $(date) -> $OUT ($fails failed)"
