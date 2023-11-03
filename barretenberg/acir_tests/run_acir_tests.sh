#!/bin/bash
# Env var overrides:
#   BIN: to specify a different binary to test with (e.g. bb.js or bb.js-dev).
#   VERBOSE: to enable logging for each test.
set -eu

BIN=${BIN:-../cpp/build/bin/bb}
FLOW=${FLOW:-prove_and_verify}
CRS_PATH=~/.bb-crs
NOIR_REPO="https://github.com/noir-lang/noir.git"
BRANCH=tf/acir-artifact
VERBOSE=${VERBOSE:-}
TEST_NAMES=("$@")

FLOW_SCRIPT=$(realpath ./flows/${FLOW}.sh)

if [ -f $BIN ]; then
    BIN=$(realpath $BIN)
else
    BIN=$(realpath $(which $BIN))
fi

export BIN CRS_PATH VERBOSE

# Pull down the test vectors from the noir repo, if we don't have the folder already.
if [ ! -d acir_tests ]; then
  if [ -n "${TEST_SRC:-}" ]; then
    cp -R $TEST_SRC acir_tests
  else
    # Search for successful workflow runs on the specified branch
    WORKFLOW_RUNS=$(gh run list -b $BRANCH -w "Rebuild ACIR artifacts" --repo $NOIR_REPO --json databaseId --json conclusion) 
    WORKFLOW_RUNS=$(echo $WORKFLOW_RUNS | jq 'map(select(.conclusion == "success")) | map(.databaseId)' | jq @sh | xargs echo)
    
    # Iterate through workflow runs until we find one with ACIR artifacts
    set +eu
    for WORKFLOW_RUN in $WORKFLOW_RUNS; do
      
      echo "Checking workflow run $WORKFLOW_RUN" 
      gh run download $WORKFLOW_RUN --dir acir_tests --repo $NOIR_REPO -n acir-artifacts
      if [[ $? -eq "0" ]]; then
        break;
      fi
    done 
    set -eu

  fi
fi

cd acir_tests

# Convert them to array
SKIP_ARRAY=(diamond_deps_0 workspace workspace_default_member)

function test() {
  cd $1

  set +e
  start=$(date +%s%3N)
  $FLOW_SCRIPT
  result=$?
  end=$(date +%s%3N)
  duration=$((end - start))
  set -eu

  if [ $result -eq 0 ]; then
    echo -e "\033[32mPASSED\033[0m ($duration ms)"
  else
    echo -e "\033[31mFAILED\033[0m"
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

    if [[ ! -f ./$TEST_NAME/target/acir.gz || ! -f ./$TEST_NAME/target/witness.gz ]]; then
      echo -e "\033[33mSKIPPED\033[0m (uncompiled)"
      continue
    fi

    test $TEST_NAME
  done
fi
