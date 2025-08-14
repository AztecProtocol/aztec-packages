#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
cd ../acir_tests/$1
export BROWSER=$2

# Launch browser server
dump_fail \
  "cd ../../browser-test-app && ../node_modules/.bin/serve -n -L -p 8080 -c ../serve.json dest" > /dev/null &
while ! nc -z localhost 8080 &>/dev/null; do sleep 1; done;

# Use the browser binary for the test
../../headless-test/bb.js.browser prove_and_verify -b target/program.json -v
