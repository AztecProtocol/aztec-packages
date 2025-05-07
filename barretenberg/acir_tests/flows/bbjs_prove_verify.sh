#!/bin/bash

# prove and verify using bb.js classes
set -eu

if [ "${SYS:-}" != "ultra_honk" ]; then
  echo "Error: This flow only supports ultra_honk"
  exit 1
fi

artifact_dir=$(realpath ./target)
output_dir=$artifact_dir/bbjs-tmp
mkdir -p $output_dir

# Cleanup on exit
trap "rm -rf $output_dir" EXIT

# Writes the proof, public inputs ./target; this also writes the VK
node ../../bbjs-test prove \
  -b $artifact_dir/program.json \
  -w $artifact_dir/witness.gz \
  -o $output_dir \
  --multi-threaded

# Verify the proof by reading the files in ./target
node ../../bbjs-test verify \
  -d $output_dir
