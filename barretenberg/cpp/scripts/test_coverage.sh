#!/usr/bin/env bash
set -eu

cd $(dirname $0)/..
NATIVE_PRESET=clang16-coverage ./bootstrap.sh
rm -rf build-coverage/profdata
mkdir -p build-coverage/profdata
export LLVM_PROFILE_FILE="$(pwd)/build-coverage/profdata/%m.%p.profraw"
NATIVE_PRESET=clang16-coverage ./bootstrap.sh test
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
