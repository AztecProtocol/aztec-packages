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

# bb.js expects proof and public inputs to be separate files, so we need to split them
# this will not be needed after #11024

# Save public inputs as a separate file (first NUM_PUBLIC_INPUTS fields of proof_fields.json)
PROOF_FIELDS_LENGTH=$(jq 'length' $output_dir/proof_fields.json)
UH_PROOF_FIELDS_LENGTH=440
NUM_PUBLIC_INPUTS=$((PROOF_FIELDS_LENGTH - UH_PROOF_FIELDS_LENGTH))
jq ".[:$NUM_PUBLIC_INPUTS]" $output_dir/proof_fields.json > $output_dir/public_inputs_fields.json

# Remove public inputs from the proof (first NUM_PUBLIC_INPUTS*32 bytes)
# Also remove the first 4 bytes, which is the proof length in fields
proof_hex=$(cat $output_dir/proof | xxd -p)
echo -n ${proof_hex:$((NUM_PUBLIC_INPUTS * 64 + 8))} | xxd -r -p > $output_dir/proof

# Verify the proof with bb.js classes
node ../../bbjs-test verify \
  -d $output_dir
