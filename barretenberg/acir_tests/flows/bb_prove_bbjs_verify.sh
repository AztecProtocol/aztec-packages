#!/bin/bash

# Usage:
#   BIN=/path/to/bb SYS=ultra_honk ./run_ultra_honk_flow.sh
#
# This script generates a proof with Barretenberg’s UltraHonk backend and then
# verifies it using bb.js. The environment variable $BIN must point to the
# Barretenberg CLI executable (e.g. “bb”). Under set -u, any undefined variable
# is treated as a fatal error.

set -eu

# Ensure that BIN is defined; otherwise, print a clear error and exit.
: "${BIN:?Environment variable BIN must be set to the Barretenberg CLI executable (e.g. /usr/local/bin/bb).}"

if [ "${SYS:-}" != "ultra_honk" ]; then
  echo "Error: This flow only supports ultra_honk"
  exit 1
fi

artifact_dir=$(realpath ./target)
output_dir=$artifact_dir/bbjs-bb-tmp
mkdir -p $output_dir

# Cleanup on exit
trap "rm -rf $output_dir" EXIT

# Generate the proof and VK using BB CLI (save as both bytes and fields)
$BIN prove \
  --scheme ultra_honk \
  -b $artifact_dir/program.json \
  -w $artifact_dir/witness.gz \
  --output_format bytes_and_fields \
  -o $output_dir

# Generate the VK using BB CLI
$BIN write_vk \
  --scheme ultra_honk \
  -b $artifact_dir/program.json \
  -o $output_dir

# Verify the proof with bb.js classes
node ../../bbjs-test verify \
  -d $output_dir
