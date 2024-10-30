#!/usr/bin/env bash
set -emx

echo "Calling run_acir_tests_browser.sh"

cleanup() {
  lsof -i ":8080" | awk 'NR>1 {print $2}' | xargs kill -9
  exit
}

trap cleanup SIGINT SIGTERM

# Skipping firefox because this headless firefox is so slow.
export BROWSER=${BROWSER:-chrome,webkit}

# Can be "mt" or "st".
THREAD_MODEL=${THREAD_MODEL:-mt}
FLOW_SCRIPT=${FLOW_SCRIPT:-prove_and_verify_client_ivc}

# TODO: Currently webkit doesn't seem to have shared memory so is a single threaded test regardless of THREAD_MODEL!
echo "Testing thread model: $THREAD_MODEL"
(cd browser-test-app && yarn serve:dest:$THREAD_MODEL) &
sleep 1
BIN=./headless-test/bb.js.browser FLOW=prove_and_verify_client_ivc VERBOSE=1 ./run_acir_tests.sh $@
lsof -i ":8080" | awk 'NR>1 {print $2}' | xargs kill -9
