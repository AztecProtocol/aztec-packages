#!/bin/bash

# prove with bb.js and verify using bb classes
set -eu

if [ "${SYS:-}" != "ultra_honk" ]; then
  echo "Error: This flow only supports ultra_honk"
  exit 1
fi

artifact_dir=$(realpath ./target)
output_dir=$artifact_dir/bbjs-bb-tmp
mkdir -p $output_dir

# Cleanup on exit
trap "rm -rf $output_dir" EXIT

# Generate the VK using BB CLI
$BIN write_vk \
  --scheme ultra_honk \
  --disable_zk \
  -b $artifact_dir/program.json \
  -o $output_dir

# Generate the proof using BB CLI (save as both bytes and fields)
$BIN prove \
  --scheme ultra_honk \
  --disable_zk \
  -b $artifact_dir/program.json \
  -w $artifact_dir/witness.gz \
  -k $output_dir/vk \
  --output_format bytes_and_fields \
  -o $output_dir

# Verify the proof with bb.js classes
node ../../bbjs-test verify \
  -d $output_dir
