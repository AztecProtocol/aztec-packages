#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

test=$1

cd ..

../../ci3/dump_fail \
  "cd browser-test-app && ../node_modules/.bin/serve -n -L -p 8080 -c ../serve.json dest" > /dev/null &
while ! nc -z localhost 8080 &>/dev/null; do sleep 1; done;
BIN=./headless-test/bb.js.browser ./scripts/run_test.sh $test
