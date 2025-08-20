#!/usr/bin/env bash
source "$(git rev-parse --show-toplevel)/ci3/source"
set -euo pipefail

cd ..
# For more verbose logging
export CI=1
# Affects meaning of 'native' in bootstrap and run_test.sh
export NATIVE_PRESET=clang16-coverage
# target max time of 15 minutes, but timing out at all is painful so bump high
export TIMEOUT=40m
./bootstrap.sh build_native
rm -rf build-coverage/profdata
mkdir -p build-coverage/profdata
export LLVM_PROFILE_FILE="$(pwd)/build-coverage/profdata/%m.%p.profraw"

function test_cmds {
  ./bootstrap.sh test_cmds | grep run_test.sh | grep -v Full6 | grep -v MaxCapacity | grep -v AvmRecursiveTests | grep -v AvmVerifierTests
  # Uncomment to include acir tests and realistic IVC inputs
  # ../acir_tests/bootstrap.sh test_cmds | grep -v main.js | grep -v browser
  # echo "disabled-cache NO_WASM=1 barretenberg/cpp/bootstrap.sh bench_ivc origin/master"
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
