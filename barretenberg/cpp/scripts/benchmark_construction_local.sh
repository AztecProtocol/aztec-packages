#!/usr/bin/env bash
# One-shot local benchmark: chonk prove on medium flow, native + wasm, at HARDWARE_CONCURRENCY.
# Prints total wall-clock and circuit-construction share for both.
#
# Usage:  ./scripts/benchmark_construction_local.sh [threads]
# Default threads = 8.
set -eu

THREADS=${1:-8}
FLOW="ecdsar1+transfer_1_recursions+sponsored_fpc"
OUT=/tmp/chonk-bench-local
mkdir -p "$OUT"

cd "$(dirname "$0")/.."
REPO_ROOT="$(git rev-parse --show-toplevel)"
INPUTS="$REPO_ROOT/yarn-project/end-to-end/example-app-ivc-inputs-out/$FLOW/ivc-inputs.msgpack"

# --- Prereqs ---
command -v wasmtime >/dev/null || { echo 'install wasmtime: brew install wasmtime'; exit 1; }
if [ ! -f "$INPUTS" ]; then
  echo "Pinned inputs missing; downloading..."
  ./scripts/test_chonk_standalone_vks_havent_changed.sh --download_pinned_inputs
fi

# --- Build ---
if [ "$(uname)" = "Darwin" ]; then
  NATIVE_PRESET=homebrew
  export BREW_PREFIX="${BREW_PREFIX:-$(brew --prefix)}"
else
  NATIVE_PRESET=clang20-no-avm
fi
echo "== Building native bb ($NATIVE_PRESET) =="
cmake --preset "$NATIVE_PRESET" >/dev/null
cmake --build --preset "$NATIVE_PRESET" --target bb

echo "== Building wasm bb (wasm-threads) =="
cmake --preset wasm-threads >/dev/null
cmake --build --preset wasm-threads --target bb

# --- Run ---
run_one() {
  local label="$1"; shift
  local cmd=("$@")
  local log="$OUT/$label.log"
  local json="$OUT/$label.json"
  echo ">>> $label (HARDWARE_CONCURRENCY=$THREADS)"
  local t0 t1
  t0=$(python3 -c 'import time;print(time.time())')
  HARDWARE_CONCURRENCY=$THREADS BB_BENCH=1 "${cmd[@]}" \
    --ivc_inputs_path "$INPUTS" \
    -o "$OUT/$label-out" \
    --scheme chonk -v --print_bench \
    --bench_out_hierarchical "$json" >"$log" 2>&1
  t1=$(python3 -c 'import time;print(time.time())')
  python3 -c "print(f'  wall-clock: {$t1-$t0:.2f}s')"
}

run_one native ./build/bin/bb prove

# wasmtime sandbox only sees cwd + $HOME/.bb-crs, so copy msgpack to a local stage.
cp "$INPUTS" "$OUT/ivc-inputs.msgpack"
INPUTS="$OUT/ivc-inputs.msgpack"
run_one wasm ./scripts/wasmtime.sh --dir="$OUT" ./build-wasm-threads/bin/bb prove

# --- Extract numbers ---
python3 - <<PY
import json
for label in ("native","wasm"):
    d = json.load(open(f"$OUT/{label}.json"))
    total_ms  = sum(e["time_max"] for e in d.get("ChonkAPI::prove", [])) / 1e6
    create_ms = sum(e["time_max"] for e in d.get("create_circuit", [])) / 1e6
    pct = 100*create_ms/total_ms if total_ms else 0
    print(f"{label:7}  total {total_ms/1000:6.2f}s   create_circuit {create_ms/1000:5.2f}s  ({pct:4.1f}%)")
PY

echo
echo "Full logs + JSON in $OUT/"
