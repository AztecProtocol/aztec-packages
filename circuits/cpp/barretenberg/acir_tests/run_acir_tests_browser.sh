#!/bin/bash
set -em

cleanup() {
  lsof -i ":8080" | awk 'NR>1 {print $2}' | xargs kill -9
  exit
}

trap cleanup SIGINT SIGTERM

# Skipping firefox because this headless firefox is so slow.
export BROWSER=${BROWSER:-chrome,webkit}

# Test multi-threaded.
# TODO: Currently webkit doesn't seem to have shared memory so this is still a single threaded test!
echo "Testing multi-threaded..."
(cd browser-test-app && yarn serve:dest:mt) > /dev/null 2>&1 &
sleep 1
VERBOSE=1 BIN=./headless-test/bb.js.browser ./run_acir_tests.sh $@
lsof -i ":8080" | awk 'NR>1 {print $2}' | xargs kill -9

# Test single-threaded.
echo "Testing single-threaded..."
(cd browser-test-app && yarn serve:dest:st) > /dev/null 2>&1 &
sleep 1
VERBOSE=1 BIN=./headless-test/bb.js.browser ./run_acir_tests.sh $@
lsof -i ":8080" | awk 'NR>1 {print $2}' | xargs kill -9