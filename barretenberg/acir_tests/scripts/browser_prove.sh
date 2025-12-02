#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
cd ../acir_tests/$1
export BROWSER=$2

# The headless test will start its own server
../../headless-test/bb.js.browser prove_and_verify -b target/program.json -v
