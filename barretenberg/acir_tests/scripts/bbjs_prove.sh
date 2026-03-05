#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

test_name=$1
shift
cd ../acir_tests/$test_name

export HARDWARE_CONCURRENCY=8

mkdir -p output-$$
trap "rm -rf output-$$" EXIT

# Writes the proof, public inputs ./target; this also writes the VK
node ../../bbjs-test prove \
  -b target/program.json \
  -w target/witness.gz \
  -o output-$$ \
  "$@"

# Verify the proof by reading the files in ./target
node ../../bbjs-test verify \
  -d output-$$
