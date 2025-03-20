#!/bin/bash

# prove with bb.js and verify using bb cli
set -eu

if [ "${SYS:-}" != "ultra_honk" ]; then
  echo "Error: This flow only supports ultra_honk"
  exit 1
fi

artifact_dir=$(realpath ./target)
output_dir=$artifact_dir/bb-bbjs-tmp
mkdir -p $output_dir

# Cleanup on exit
trap "rm -rf $output_dir" EXIT

# Writes the proof, public inputs ./target; this also writes the VK
node ../../bbjs-test prove \
  -b $artifact_dir/program.json \
  -w $artifact_dir/witness.gz \
  -o $output_dir

# Join the proof and public inputs to a single file
# this will not be needed after #11024

proof_bytes=$(cat $output_dir/proof | xxd -p)
public_inputs=$(cat $output_dir/public-inputs | jq -r '.[]')
proof_start=${proof_bytes:0:8}
proof_end=${proof_bytes:8}

public_inputs_bytes=""
for input in $public_inputs; do
  public_inputs_bytes+=$input
done

# Combine proof start, public inputs, and rest of proof
echo -n $proof_start$public_inputs_bytes$proof_end | xxd -r -p > $output_dir/proof

# Print the length of the proof file in bytes
ls -l $output_dir/proof | awk '{print $5}'

# Verify the proof with bb cli
$BIN verify \
  --scheme ultra_honk \
  -k $output_dir/vk \
  -p $output_dir/proof
