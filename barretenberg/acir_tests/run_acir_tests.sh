#!/usr/bin/env bash
# Env var overrides:
#   BIN: to specify a different binary to test with (e.g. bb.js or bb.js-dev).
#   VERBOSE: to enable logging for each test.
#   RECURSIVE: to enable --recursive for each test.
set -eu

# Catch when running in parallel
error_file="/tmp/error.$$"
pids=()
source ./bash_helpers/catch.sh
trap handle_sigchild SIGCHLD

BIN=${BIN:-../cpp/build/bin/bb}
FLOW=${FLOW:-prove_and_verify}
HONK=${HONK:-false}
CRS_PATH=~/.bb-crs
BRANCH=master
VERBOSE=${VERBOSE:-}
TEST_NAMES=("$@")
# We get little performance benefit over 16 cores (in fact it can be worse).
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
RECURSIVE=${RECURSIVE:-false}

FLOW_SCRIPT=$(realpath ./flows/${FLOW}.sh)

if [ -f $BIN ]; then
    BIN=$(realpath $BIN)
else
    BIN=$(realpath $(which $BIN))
fi

export BIN CRS_PATH VERBOSE BRANCH RECURSIVE

# copy the gzipped acir test data from noir/noir-repo/test_programs to barretenberg/acir_tests
./clone_test_vectors.sh

cd acir_tests

# Convert them to array
# There are no issues witht the tests below but as they check proper handling of dependencies or circuits that are part of a workspace
# running these require extra gluecode so they are skipped for the purpose of this script
SKIP_ARRAY=(diamond_deps_0 workspace workspace_default_member)

# TODO(https://github.com/AztecProtocol/barretenberg/issues/1108): problem regardless the proof system used
SKIP_ARRAY+=(regression_5045)


# if HONK is false, we should skip verify_honk_proof
if [ "$HONK" = false ]; then
    # Don't run programs with Honk recursive verifier
    SKIP_ARRAY+=(verify_honk_proof double_verify_honk_proof)
fi

if [ "$HONK" = true ]; then
    # Don't run programs with Plonk recursive verifier(s)
    SKIP_ARRAY+=(single_verify_proof double_verify_proof double_verify_nested_proof)
fi

function test() {
  cd $1

  set +e
  start=$SECONDS
  $FLOW_SCRIPT
  result=$?
  end=$SECONDS
  duration=$((end - start))
  set -eu

  if [ $result -eq 0 ]; then
    echo -e "\033[32mPASSED\033[0m ($duration s)"
  else
    echo -e "\033[31mFAILED\033[0m"
    touch "$error_file"
    exit 1
  fi

  cd ..
}

if [ "${#TEST_NAMES[@]}" -ne 0 ]; then
  for NAMED_TEST in "${TEST_NAMES[@]}"; do
    echo -n "Testing $NAMED_TEST... "
    test $NAMED_TEST
  done
else
  for TEST_NAME in $(find -maxdepth 1 -type d -not -path '.' | sed 's|^\./||'); do
    echo -n "Testing $TEST_NAME... "

    if [[ " ${SKIP_ARRAY[@]} " =~ " $TEST_NAME" ]]; then
      echo -e "\033[33mSKIPPED\033[0m (hardcoded to skip)"
      continue
    fi

    if [[ ! -f ./$TEST_NAME/target/program.json || ! -f ./$TEST_NAME/target/witness.gz ]]; then
      echo -e "\033[33mSKIPPED\033[0m (uncompiled)"
      continue
    fi

    # If parallel flag is set, run in parallel
    if [ -n "${PARALLEL:-}" ]; then
      test $TEST_NAME &
    else
      test $TEST_NAME
    fi
  done
fi

wait

# Check for parallel errors
check_error_file
