#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

if [ $# -ne 2 ]; then
  echo "Usage: $0 <input_folder> <output_folder>"
  exit 1
fi
export input_folder="$1"
output_folder="$2"

cd ..

echo_header "bb ivc write_vk build step"

export HARDWARE_CONCURRENCY=16

function write_vk {
  set -eu
  local flow_folder="$input_folder/$1"
  ./build/bin/bb write_vk --scheme client_ivc -v --ivc_inputs_path "$flow_folder/ivc-inputs.msgpack" --verifier_type ivc -o "$flow_folder"
}

export -f write_vk

# Run on one public and one private input.
PRIV=ecdsar1+transfer_0_recursions+sponsored_fpc
PUB=ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc
parallel -v --line-buffer --tag write_vk {} ::: $PRIV $PUB


mkdir -p "$output_folder"
mv "$input_folder/$PRIV/vk" "$output_folder/private-civc-vk"
mv "$input_folder/$PUB/vk" "$output_folder/public-civc-vk"
