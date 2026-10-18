#!/usr/bin/env bash
# Runs the same hinted public transaction through vm2_sim natively and in wasm (under node, so V8), and checks the
# wasm run catches the simulator's C++ exceptions and reaches the native result.
set -euo pipefail
cd $(dirname $0)/..

native_bin=$(scripts/preset-build-dir ${NATIVE_PRESET:-clang20})/bin/vm2_sim_smoke
wasm_bin=build-wasm/bin/vm2_sim_smoke
inputs_dir=src/barretenberg/vm2/testing
inputs=minimal_tx.testdata.bin

native=$($native_bin $inputs_dir/$inputs | grep -E '^(caught|revert_code)')
wasm=$(node --no-warnings scripts/run_wasi_command.mjs $wasm_bin $inputs_dir /data/$inputs |
  grep -E '^(caught|revert_code)')

echo "native: $native"
echo "wasm:   $wasm"
[ "$(echo "$wasm" | grep -c '^caught TagMismatchException')" -eq 1 ]
[ "$native" == "$wasm" ]
