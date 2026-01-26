#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source

# export bb as it is needed when using exported functions
export bb="$root/barretenberg/cpp/$(./native-preset-build-dir)/bin/bb"
cd ..

# NOTE: We pin the captured IVC inputs to a known master commit, exploiting that there won't be frequent changes.
# This allows us to compare the generated VKs here with ones we compute freshly, detecting breaking protocol changes.
# IF A VK CHANGE IS EXPECTED - we need to redo this:
# - Generate inputs: $root/yarn-project/end-to-end/bootstrap.sh build_bench
# - Compress the results: tar -czf bb-chonk-inputs.tar.gz -C example-app-ivc-inputs-out .
# - Generate a hash for versioning: sha256sum bb-chonk-inputs.tar.gz
# - Upload the compressed results: aws s3 cp bb-chonk-inputs.tar.gz s3://aztec-ci-artifacts/protocol/bb-chonk-inputs-[hash(0:8)].tar.gz
# Note: In case of the "Test suite failed to run ... Unexpected token 'with' " error, need to run: docker pull aztecprotocol/build:3.0
pinned_short_hash="77e58648"
pinned_chonk_inputs_url="https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/bb-chonk-inputs-${pinned_short_hash}.tar.gz"

script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/scripts" && pwd)/$(basename "${BASH_SOURCE[0]}")"

function update_pinned_hash_in_script {
    local new_hash=$1
    echo "Updating pinned_short_hash in script to: $new_hash"
    sed -i "s/^pinned_short_hash=\"[^\"]*\"/pinned_short_hash=\"$new_hash\"/" "$script_path"
}

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

    # 4) Update the pinned hash in this script
    update_pinned_hash_in_script "$short_hash"

    echo "Done. New inputs available at:"
    echo "  ${s3_uri}"
    echo "Script updated with new pinned_short_hash: $short_hash"
}

function check_circuit_vks {
  set -eu
  local flow_folder="$inputs_tmp_dir/$1"
  local output
  local exit_code=0

  output=$($bb check --scheme chonk --ivc_inputs_path "$flow_folder/ivc-inputs.msgpack") || exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    # Check if this is actually a VK change
    if echo "$output" | grep -q "VK mismatch detected\|Expected precomputed vk"; then
      echo_stderr "Error: VK change detected in $flow_folder!"
      echo_stderr "$output"
      exit 1
    else
      # Some other error occurred (file corruption, crash, etc.)
      echo_stderr "Error: bb check failed in $flow_folder (not a VK change):"
      echo_stderr "$output"
      echo_stderr ""
      echo_stderr "This indicates a bug or regression that is not related to VK changes."
      echo_stderr "If this failure wasn't caught by other tests, please add a test case to prevent this regression."
      exit 2
    fi
  fi
}

export -f check_circuit_vks

function prove_and_verify_inputs {
  set -eu
  local flow_folder="$inputs_tmp_dir/$1"
  local proof_exit_code=0

  echo "Running proof test for $1..."
  $bb prove --scheme chonk --ivc_inputs_path "$flow_folder/ivc-inputs.msgpack" > /dev/null 2>&1 || prove_exit_code=$?

  if [[ $proof_exit_code -ne 0 ]]; then
    echo "Proof test failed for flow $1. Please re-run the script with flag --update_inputs."

    cp "$flow_folder/ivc-inputs.msgpack" "$root/yarn-project/end-to-end/example-app-ivc-inputs-out/$1/ivc-inputs.msgpack"
    echo "Inputs copied in yarn-project for debugging"
    exit 1
  fi
}

export -f prove_and_verify_inputs

# Extract exit code from job logs of parallel execution
function extract_exit_code {
  local log_file="$1"
  local exit_code=0

  awk 'NR>1 { codes[$7]=1 } END {
    has_other = 0;
    has_one = 0;
    for (code in codes) {
      if (code != 0 && code != 1) has_other = 1;
      if (code == 1) has_one = 1;
    }
    if (has_other) exit 2;
    if (has_one) exit 1;
    exit 0;
  }' "$log_file" || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    return 0
  elif [[ $exit_code -eq 1 ]]; then
    return 1
  else
    return 2
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat << EOF
  Usage: $(basename "$0") [OPTIONS]

  Options:
      none                       Test that Chonk standalone VKs haven't changed
      --update_inputs            Generate new IVC inputs and upload to S3
      --prove_and_verify         Prove and verify current pinned inputs
      -h, --help                 Show this help message

  Description:
      Tests that Chonk standalone VKs haven't changed by comparing
      generated VKs with pinned reference inputs.
EOF
  exit 0
elif [[ "${1:-}" == "--update_inputs" ]]; then
    # For easily rerunning the inputs generation
    set -eu
    trap 'rm -f bb-chonk-inputs.tar.gz' EXIT SIGINT
    echo "Updating pinned IVC inputs..."

    # Generate new inputs
    echo "Running bootstrap to generate new IVC inputs..."

    BOOTSTRAP_TO=yarn-project ../../bootstrap.sh # bootstrap aztec-packages from root
    ../../yarn-project/end-to-end/bootstrap.sh build_bench # build bench to generate IVC inputs

    compress_and_upload ../../yarn-project/end-to-end/example-app-ivc-inputs-out

    prove_exit_code=0
    parallel -v --line-buffer --tag prove_and_verify_inputs {} ::: $(ls ../../yarn-project/end-to-end/example-app-ivc-inputs-out) || prove_exit_code=$?

    if [[ $prove_exit_code -eq 1 ]]; then
      echo "One or more flows failed the proof test after updating inputs. Please investigate."
      exit 1
    fi
    exit 0
else
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

  ls "$inputs_tmp_dir"

  if [[ "${1:-}" == "--prove_and_verify" ]]; then
    # Prove and verify the current pinned inputs
    prove_exit_code=0
    parallel -v --line-buffer --tag prove_and_verify_inputs {} ::: $(ls "$inputs_tmp_dir") || prove_exit_code=$?

    if [[ $prove_exit_code -ne 0 ]]; then
      echo "One or more flows failed the proof test after updating inputs. Please investigate."
      exit 1
    else
      echo "All inputs were successfully proven and verified."
    fi
    exit 0
  else
    exit_code=0
    parallel --joblog "$inputs_tmp_dir/joblog.log" -v --line-buffer --tag check_circuit_vks {} ::: $(ls "$inputs_tmp_dir") || true

    extract_exit_code "$inputs_tmp_dir/joblog.log" || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
      echo "No VK changes detected. Short hash is: ${pinned_short_hash}"
    elif [[ $exit_code -eq 1 ]]; then
      # All flows had VK changes
      echo "VK changes detected. Please re-run the script with --update_fast or --update_inputs"
      exit 1
    else
      # At least one real error
      echo "Real error detected, please investigate."
      exit $exit_code
    fi
  fi
fi
