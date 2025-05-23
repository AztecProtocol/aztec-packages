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

function cpp_test_cmds {
  # Run all direct C++ tests with coverage
  # exclude the one test that does not complete within 15 minutes
  ./bootstrap.sh test_cmds
}
function acir_test_cmds {
  ../acir_tests/bootstrap.sh test_cmds | grep -v wasm | grep -v browser
}
function bench_test_cmds {
   echo "disabled-cache NO_WASM=1 barretenberg/cpp/bootstrap.sh bench_ivc origin/next"
}
function test_cmds {
  cpp_test_cmds
  acir_test_cmds
  bench_test_cmds
}
test_cmds #| echo #parallelise
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
