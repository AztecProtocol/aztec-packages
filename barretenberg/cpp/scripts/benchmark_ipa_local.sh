#!/usr/bin/env bash
# Build and run the ipa_bench target locally (native + wasm).
# Times IPA opening-proof and verification on random claims across sizes 2^10..2^16.
#
# Usage: ./scripts/benchmark_ipa_local.sh [threads]   (default 8)
set -eu

THREADS=${1:-8}
OUT=/tmp/ipa-bench-local
mkdir -p "$OUT"

cd "$(dirname "$0")/.."

# --- Build ---
if [ "$(uname)" = "Darwin" ]; then
  NATIVE_PRESET=homebrew
  export BREW_PREFIX="${BREW_PREFIX:-$(brew --prefix)}"
else
  NATIVE_PRESET=clang20-no-avm
fi
TARGET=commit_bench
FILTER='bench_pippenger_without_endomorphism_basis_points.*Grumpkin'

echo "== Building $TARGET native ($NATIVE_PRESET) =="
cmake --preset "$NATIVE_PRESET" >/dev/null
cmake --build --preset "$NATIVE_PRESET" --target $TARGET

echo "== Building $TARGET wasm (wasm-threads) =="
cmake --preset wasm-threads >/dev/null
cmake --build --preset wasm-threads --target $TARGET

# --- Run (Grumpkin MSM, the dominant cost of random IPA claim generation) ---
echo
echo ">>> native (HARDWARE_CONCURRENCY=$THREADS)"
HARDWARE_CONCURRENCY=$THREADS ./build/bin/$TARGET \
  --benchmark_filter="$FILTER" \
  --benchmark_out="$OUT/native.json" --benchmark_out_format=json 2>&1 | tee "$OUT/native.log"

echo
echo ">>> wasm (HARDWARE_CONCURRENCY=$THREADS)"
HARDWARE_CONCURRENCY=$THREADS ./scripts/wasmtime.sh --dir="$OUT" ./build-wasm-threads/bin/$TARGET \
  --benchmark_filter="$FILTER" \
  --benchmark_out="$OUT/wasm.json" --benchmark_out_format=json 2>&1 | tee "$OUT/wasm.log"

echo
echo "Results saved under $OUT/"
