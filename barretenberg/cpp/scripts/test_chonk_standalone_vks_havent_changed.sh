#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source

# export bb as it is needed when using exported functions
export bb=$(./find-bb)
cd ..

# NOTE: We pin the captured IVC inputs to a known master commit, exploiting that there won't be frequent changes.
# This allows us to compare the generated VKs here with ones we compute freshly, detecting breaking protocol changes.
# IF A VK CHANGE IS EXPECTED - we need to redo this:
# - Generate inputs: $root/yarn-project/end-to-end/bootstrap.sh build_bench
# - Compress the results: tar -czf bb-chonk-inputs.tar.gz -C example-app-ivc-inputs-out .
# - Generate a hash for versioning: sha256sum bb-chonk-inputs.tar.gz
# - Upload the compressed results: aws s3 cp bb-chonk-inputs.tar.gz s3://aztec-ci-artifacts/protocol/bb-chonk-inputs-[hash(0:8)].tar.gz
# Note: In case of the "Test suite failed to run ... Unexpected token 'with' " error, need to run: docker pull aztecprotocol/build:3.0
pinned_short_hash="79b094d8"
pinned_chonk_inputs_url="https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/bb-chonk-inputs-${pinned_short_hash}.tar.gz"

function compress_and_upload {
    # 1) Compress the results
    echo "Compressing the generated inputs..."
    tar -czf bb-chonk-inputs.tar.gz -C $1 .

    # 2) Compute a short hash for versioning
    echo "Computing SHA256 hash for versioning..."
    full_hash=$(sha256sum bb-chonk-inputs.tar.gz | awk '{ print $1 }')
    short_hash=${full_hash:0:8}
    echo "Short hash is: $short_hash"

    # 3) Upload to S3
    s3_key="bb-chonk-inputs-${short_hash}.tar.gz"
    s3_uri="s3://aztec-ci-artifacts/protocol/${s3_key}"
    echo "Uploading bb-chonk-inputs.tar.gz to ${s3_uri}..."
    aws s3 cp bb-chonk-inputs.tar.gz "${s3_uri}"

    echo "Done. New inputs available at:"
    echo "  ${s3_uri}"
    echo "Update the pinned_chonk_inputs_url in this script to point to the new location."
}

# For easily rerunning the inputs generation
if [[ "${1:-}" == "--update_inputs" ]]; then
    set -eu
    echo "Updating pinned IVC inputs..."

    # Generate new inputs
    echo "Running bootstrap to generate new IVC inputs..."

    BOOTSTRAP_TO=yarn-project ../../bootstrap.sh # bootstrap aztec-packages from root
    ../../yarn-project/end-to-end/bootstrap.sh build_bench # build bench to generate IVC inputs

    compress_and_upload ../../yarn-project/end-to-end/example-app-ivc-inputs-out

    exit 0
fi

export inputs_tmp_dir=$(mktemp -d)
trap 'rm -rf "$inputs_tmp_dir" bb-chonk-inputs.tar.gz' EXIT SIGINT

echo "Downloading pinned IVC inputs from: $pinned_chonk_inputs_url"
if ! curl -s -f "$pinned_chonk_inputs_url" -o bb-chonk-inputs.tar.gz; then
    echo_stderr "Error: Failed to download pinned IVC inputs from $pinned_chonk_inputs_url"
    echo_stderr "The pinned short hash '$pinned_short_hash' may be invalid or the file may not exist in S3."
    exit 1
fi

echo "Extracting IVC inputs..."
if ! tar -xzf bb-chonk-inputs.tar.gz -C "$inputs_tmp_dir"; then
    echo_stderr "Error: Failed to extract IVC inputs archive"
    exit 1
fi

function check_circuit_vks {
  set -eu
  local flow_folder="$inputs_tmp_dir/$1"

  if [[ "${2:-}" == "--update_inputs" ]]; then
    $bb check --update_inputs --scheme chonk --ivc_inputs_path "$flow_folder/ivc-inputs.msgpack" || { echo_stderr "Error: Likely VK change detected in $flow_folder! Updating inputs."; exit 1; }
  else
    $bb check --scheme chonk --ivc_inputs_path "$flow_folder/ivc-inputs.msgpack" || { echo_stderr "Error: Likely VK change detected in $flow_folder!"; exit 1; }
  fi
}

export -f check_circuit_vks

# Run on one public and one private input.
ls "$inputs_tmp_dir"

if [[ "${1:-}" == "--update_fast" ]]; then
  parallel -v --line-buffer --tag check_circuit_vks {} --update_inputs ::: $(ls "$inputs_tmp_dir") \
    && echo "No VK changes detected. Short hash is: ${pinned_short_hash}" \
    || compress_and_upload $inputs_tmp_dir
else
  parallel -v --line-buffer --tag check_circuit_vks {} ::: $(ls "$inputs_tmp_dir") \
    && echo "No VK changes detected. Short hash is: ${pinned_short_hash}" \
    || (echo "VK changes detected. Please re-run the script with --update_fast or --update_inputs" && exit 1)
fi
