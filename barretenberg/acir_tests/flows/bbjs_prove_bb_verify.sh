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

proof_bytes=$(cat $output_dir/proof | xxd -p)
public_inputs=$(cat $output_dir/public_inputs_fields.json | jq -r '.[]')

public_inputs_bytes=""
for input in $public_inputs; do
  public_inputs_bytes+=$input
done

# Combine proof header and the proof to a single file
echo -n $proof_bytes | xxd -r -p > $output_dir/proof
echo -n $public_inputs_bytes | xxd -r -p > $output_dir/public_inputs
echo "$BIN verify \
  --scheme ultra_honk \
  -k $output_dir/vk \
  -p $output_dir/proof \
  -i $output_dir/public_inputs"

# Verify the proof with bb cli
$BIN verify \
  --scheme ultra_honk \
  -k $output_dir/vk \
  -p $output_dir/proof \
  -i $output_dir/public_inputs
