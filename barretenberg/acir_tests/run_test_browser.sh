#!/usr/bin/env bash
# We run in docker to provide network isolation.
set -eu

test=$1

name="$BROWSER-$THREAD_MODEL-$test${NAME_POSTFIX:-}"
trap 'docker kill $name &>/dev/null; docker rm $name &>/dev/null' SIGINT SIGTERM

docker run --rm \
  --name $name \
  --cpus=8 \
  --memory 8g \
  -v/tmp:/tmp \
  -v$(git rev-parse --show-toplevel):/root/aztec-packages \
  -v$HOME/.bb-crs:/root/.bb-crs \
  --workdir /root/aztec-packages/barretenberg/acir_tests \
  -e NODE_OPTIONS="--no-warnings --experimental-vm-modules" \
  -e BROWSER=${BROWSER:-chrome,webkit} \
  -e THREAD_MODEL=${THREAD_MODEL:-mt} \
  -e TEST=$test \
  -e VERBOSE=${VERBOSE:-0} \
  aztecprotocol/build:3.0 bash -c '
    git config --global --add safe.directory /root/aztec-packages
    source /root/aztec-packages/ci3/source
    dump_fail "cd browser-test-app && yarn serve:dest:$THREAD_MODEL" > /dev/null &
    while ! nc -z localhost 8080 &>/dev/null; do sleep 1; done;
    BIN=./headless-test/bb.js.browser ./run_test.sh $TEST
  '