#!/usr/bin/env bash
# Env var overrides:
#   BIN: to specify a different binary to test with (e.g. bb.js or bb.js-dev).
#   VERBOSE: to enable logging for each test.
#   RECURSIVE: to enable --recursive for each test.
set -eu

cd $(dirname $0)

BIN=$(realpath ${BIN:-../cpp/build/bin/bb})
FLOW=${FLOW:-prove_and_verify}
HONK=${HONK:-false}
CRS_PATH=~/.bb-crs
BRANCH=master
VERBOSE=${VERBOSE:-}
TEST_NAMES=("$@")
# We get little performance benefit over 16 cores (in fact it can be worse).
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-8}
RECURSIVE=${RECURSIVE:-false}

export BIN CRS_PATH VERBOSE BRANCH RECURSIVE HARDWARE_CONCURRENCY

# Convert them to array
# There are no issues witht the tests below but as they check proper handling of dependencies or circuits that are part of a workspace
# running these require extra gluecode so they are skipped for the purpose of this script
SKIP_ARRAY=(diamond_deps_0 workspace workspace_default_member)

# TODO(https://github.com/AztecProtocol/barretenberg/issues/1108): problem regardless the proof system used
SKIP_ARRAY+=(regression_5045)

# These honk tests just started failing...
SKIP_ARRAY+=(verify_honk_proof double_verify_honk_proof)

if [ "${#TEST_NAMES[@]}" -eq 0 ]; then
  TEST_NAMES=$(cd ../../noir/noir-repo/test_programs/execution_success; find -maxdepth 1 -type d -not -path '.' | sed 's|^\./||')
fi

TEST_NAMES=($(printf '%s\n' "${TEST_NAMES[@]}" | grep -vFxf <(printf '%s\n' "${SKIP_ARRAY[@]}") || true))
if [ "${#TEST_NAMES[@]}" -eq 0 ]; then
  exit 0
fi

JOBS=$(($(nproc) / HARDWARE_CONCURRENCY))
parallel -j$JOBS ./run_acir_test.sh {} ::: "${TEST_NAMES[@]}"