#!/usr/bin/env bash
# Env var overrides:
#   BIN: to specify a different binary to test with (e.g. bb.js or bb.js-dev).
#   VERBOSE: to enable logging for each test.
#   RECURSIVE: to enable --recursive for each test.
source $(git rev-parse --show-toplevel)/ci3/source

BIN=$(realpath ${BIN:-../cpp/build/bin/bb})
FLOW=${FLOW:-prove_and_verify}
HONK=${HONK:-false}
CRS_PATH=~/.bb-crs
VERBOSE=${VERBOSE:-}
TEST_NAMES=("$@")
# We get little performance benefit over 16 cores (in fact it can be worse).
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-8}
RECURSIVE=${RECURSIVE:-false}

export BIN CRS_PATH VERBOSE RECURSIVE HARDWARE_CONCURRENCY

if [ "${#TEST_NAMES[@]}" -eq 0 ]; then
  TEST_NAMES=$(cd ./acir_tests; find -maxdepth 1 -type d -not -path '.' | sed 's|^\./||')
fi

jobs=$(($(nproc) / HARDWARE_CONCURRENCY))
parallel -j$jobs --line-buffered --joblog joblog.txt ./run_acir_test.sh {} ::: "${TEST_NAMES[@]}"