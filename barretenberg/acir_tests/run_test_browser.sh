#!/usr/bin/env bash
set -eu

cleanup() {
    [ -n "$pid" ] && kill $pid 2>/dev/null || true
}
trap cleanup EXIT

cd $(dirname $0)

# Skipping firefox because this headless firefox is so slow.
export BROWSER=${BROWSER:-chrome,webkit}

# Can be "mt" or "st".
THREAD_MODEL=${THREAD_MODEL:-mt}

# TODO: Currently webkit doesn't seem to have shared memory so is a single threaded test regardless of THREAD_MODEL!
(cd browser-test-app && yarn serve:dest:$THREAD_MODEL) > /dev/null 2>&1 &
pid=$!
sleep 1

BIN=./headless-test/bb.js.browser ./run_test.sh $@