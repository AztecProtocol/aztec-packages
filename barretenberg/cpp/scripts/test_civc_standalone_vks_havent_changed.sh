#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source

export IGNITION_CRS_PATH=./srs_db/ignition
export GRUMPKIN_CRS_PATH=./srs_db/grumpkin

cd ..

# NOTE: We pin the captured IVC inputs to a known master commit, exploiting that there won't be frequent changes.
# This allows us to compare the generated VKs here with ones we compute freshly, detecting breaking protocol changes.
pinned_civc_inputs_url="https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/bb-civc-inputs-v3.tar.gz"

export inputs_tmp_dir=$(mktemp -d)
trap 'rm -rf "$inputs_tmp_dir"' EXIT SIGINT

curl -s -f "$pinned_civc_inputs_url" | tar -xzf - -C "$inputs_tmp_dir" &>/dev/null

function check_circuit_vks {
  set -eu
  local flow_folder="$inputs_tmp_dir/$1"
  ./build/bin/bb check --scheme client_ivc --ivc_inputs_path "$flow_folder/ivc-inputs.msgpack" || { echo_stderr "Error: Likely VK change detected in $flow_folder!"; exit 1; }
}

export -f check_circuit_vks

# Run on one public and one private input.
parallel -v --line-buffer --tag check_circuit_vks {} ::: $(ls "$inputs_tmp_dir")
