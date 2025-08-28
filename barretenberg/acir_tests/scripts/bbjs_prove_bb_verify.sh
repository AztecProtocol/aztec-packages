#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

export HARDWARE_CONCURRENCY=8

cd ../acir_tests/$1

mkdir -p output-$$
trap "rm -rf output-$$" EXIT

# Writes the proof, public inputs ./target; this also writes the VK
node ../../bbjs-test prove \
  -b target/program.json \
  -w target/witness.gz \
  -o output-$$

# The proof and public_inputs are already in binary format from bbjs-test

bb=$(../../../cpp/scripts/find-bb)
# Verify the proof with bb cli
$bb verify \
  --scheme ultra_honk \
  -k output-$$/vk \
  -p output-$$/proof \
  -i output-$$/public_inputs
