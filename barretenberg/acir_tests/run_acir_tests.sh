#!/usr/bin/env bash
# DEPRECATED: USE bootstrap.sh test
#!/usr/bin/env bash
# Env var overrides:
#   BIN: to specify a different binary to test with (e.g. bb.js or bb.js-dev).
#   VERBOSE: to enable logging for each test.
#   RECURSIVE: to enable --recursive for each test.
set -eu

# Catch when running in parallel
error_file="/tmp/error.$$"
pids=()

# Handler for SIGCHLD, cleanup if child exit with error
handle_sigchild() {
    for pid in "${pids[@]}"; do
        # If process is no longer running
        if ! kill -0 "$pid" 2>/dev/null; then
            # Wait for the process and get exit status
            wait "$pid"
            status=$?

            # If exit status is error
            if [ $status -ne 0 ]; then
                # Create error file
                touch "$error_file"
            fi
        fi
    done
}
trap handle_sigchild SIGCHLD

BIN=${BIN:-../cpp/build/bin/bb}
FLOW=${FLOW:-prove_and_verify}
HONK=${HONK:-false}
CLIENT_IVC_SKIPS=${CLIENT_IVC_SKIPS:-false}
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
    SKIP_ARRAY+=(verify_honk_proof double_verify_honk_proof verify_rollup_honk_proof)
fi

if [ "$HONK" = true ]; then
    # Don't run programs with Plonk recursive verifier(s)
    SKIP_ARRAY+=(single_verify_proof double_verify_proof double_verify_nested_proof verify_rollup_honk_proof)
fi

if [ "$CLIENT_IVC_SKIPS" = true ]; then
    # At least for now, skip folding tests that fail when run against ClientIVC.
    # This is not a regression--folding was not being properly tested.
    # TODO(https://github.com/AztecProtocol/barretenberg/issues/1164): Resolve this
    # The reason for failure is that compile-time folding, as initially conceived, is
    # only supported by ClientIVC through hacks. ClientIVC in Aztec is ultimately to be
    # used through runtime folding, since the kernels that are needed are detected and
    # constructed at runtime in Aztec's typescript proving interface. ClientIVC appends
    # folding verifiers and does databus and Goblin merge work depending on its inputs,
    # detecting which circuits are Aztec kernels. These tests may simple fail for trivial
    # reasons, e.g. because  the number of circuits in the stack is odd.
    SKIP_ARRAY+=(fold_basic_nested_call fold_fibonacci fold_numeric_generic_poseidon ram_blowup_regression)
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
# If error file exists, exit with error
if [ -f "$error_file" ]; then
    rm "$error_file"
    echo "Error occurred in one or more child processes. Exiting..."
    exit 1
fi