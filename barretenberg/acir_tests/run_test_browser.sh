#!/usr/bin/env bash
set -eu

# cleanup() {
#     [ -n "$pid" ] && kill $pid 2>/dev/null || true
# }
# trap cleanup EXIT

# cd $(dirname $0)

# # Skipping firefox because this headless firefox is so slow.
# export BROWSER=${BROWSER:-chrome,webkit}

# # Can be "mt" or "st".
# THREAD_MODEL=${THREAD_MODEL:-mt}

# # TODO: Currently webkit doesn't seem to have shared memory so is a single threaded test regardless of THREAD_MODEL!
# $(git rev-parse --show-toplevel)/ci3/dump_fail "cd browser-test-app && yarn serve:dest:$THREAD_MODEL" > /dev/null &
# pid=$!
# while ! nc -z localhost ${PORT:-8080} &>/dev/null; do sleep 1; done;

# BIN=./headless-test/bb.js.browser ./run_test.sh $@


test=$1
name="$BROWSER-$THREAD_MODEL-$test"
trap 'docker kill $name &>/dev/null; docker rm $name &>/dev/null' SIGINT SIGTERM
docker run --rm \
  --name $name \
  --cpus=4 \
  --memory 8g \
  -v$(git rev-parse --show-toplevel):/root/aztec-packages \
  -v$HOME/.bb-crs:/root/.bb-crs \
  --workdir /root/aztec-packages/barretenberg/acir_tests \
  -e NODE_OPTIONS="--no-warnings --experimental-vm-modules" \
  -e BROWSER=${BROWSER:-chrome,webkit} \
  -e THREAD_MODEL=${THREAD_MODEL:-mt} \
  -e TEST=$test \
  aztecprotocol/build:2.0 bash -c '
    git config --global --add safe.directory /root/aztec-packages
    source /root/aztec-packages/ci3/source
    dump_fail "cd browser-test-app && yarn serve:dest:$THREAD_MODEL" > /dev/null &
    while ! nc -z localhost 8080 &>/dev/null; do sleep 1; done;
    BIN=./headless-test/bb.js.browser ./run_test.sh $TEST
  '