#!/usr/bin/env bash
source "$(git rev-parse --show-toplevel)/ci3/source"
set -euo pipefail

cd "$(dirname "$0")/.."
# Affects meaning of 'native' in bootstrap and run_test.sh
export NATIVE_PRESET=clang16-coverage
# Override default of 600s
# target max time of 15 minutes with some wiggle room
export TIMEOUT=20m
# ./bootstrap.sh build_native
rm -rf build-coverage/profdata
mkdir -p build-coverage/profdata
export LLVM_PROFILE_FILE="$(pwd)/build-coverage/profdata/%m.%p.profraw"

function test_cmds {
  # Note that HEAVY_TEST marked tests wont run with coverage
  ./bootstrap.sh test_cmds
  ../acir_tests/bootstrap.sh test_cmds | grep -v main.js | grep -v browser
  echo "disabled-cache NO_WASM=1 barretenberg/cpp/bootstrap.sh bench_ivc origin/next"
}
(test_cmds || exit 1) | parallelise
# Run llvm-profdata to merge raw profiles
llvm-profdata-16 merge -sparse build-coverage/profdata/*.profraw -o build-coverage/coverage.profdata

args=()
for bin in ./build-coverage/bin/*_tests; do
  args+=(-object "$bin")
done

# Generate coverage report with llvm-cov
llvm-cov-16 show \
  -instr-profile=build-coverage/coverage.profdata \
  -format=html \
  -output-dir=build-coverage/coverage-report \
  --ignore-filename-regex=".*/_deps/.*" \
  --ignore-filename-regex=".*/ext/starknet/.*" \
  --ignore-filename-regex=".*/lmdblib/.*" \
  --ignore-filename-regex=".*/vm2/.*" \
  "${args[@]}"

echo "Coverage report generated at build-coverage/coverage-report/index.html"
