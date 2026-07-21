#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ../acir_tests/$1

export HARDWARE_CONCURRENCY=8

bb=$(../../../cpp/scripts/find-bb)

output_dir=$(mktemp -d ./output-XXXXXX)
trap "rm -rf $output_dir" EXIT

# Generate the VK using BB CLI
$bb write_vk \
  --scheme ultra_honk \
  -b target/program.json \
  -o $output_dir

# Generate the proof using BB CLI (save as both bytes and fields)
$bb prove \
  --scheme ultra_honk \
  -b target/program.json \
  -w target/witness.gz \
  -k $output_dir/vk \
  -o $output_dir

# Verify the proof with bb.js classes
node ../../bbjs-test verify \
  -d $output_dir
