#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

# Resolve bb from an explicit preset when provided, and fall back to known build dirs.
script_dir="$root/barretenberg/cpp/scripts"
bb_preset="${BB_BUILD_PRESET:-${NATIVE_PRESET:-clang20}}"
bb="$root/barretenberg/cpp/$($script_dir/preset-build-dir "$bb_preset")/bin/bb"

export bb_preset
export bb

# The pinned IVC-inputs short hash and helpers live in chonk_inputs_lib.sh.
# It is the single source of truth for the pinned tarball that every Chonk
# benchmark and this VK consistency check consume.
source "$script_dir/chonk_inputs_lib.sh"

pinned_short_hash="$(chonk_inputs_hash)"
pinned_chonk_inputs_url="$(chonk_inputs_url)"

# NOTE: We pin the captured IVC inputs to a known master commit, exploiting that there won't be frequent changes.
# This allows us to compare the generated VKs here with ones we compute freshly, detecting breaking protocol changes.
# IF A VK CHANGE IS EXPECTED - re-run this script with `--update_inputs`, or push a `VK-UPDATE: <reason>` commit and CI
# will regenerate + push the pin update for you. See `barretenberg/cpp/scripts/regenerate_chonk_inputs.sh`.
# Note: In case of the "Test suite failed to run ... Unexpected token 'with' " error, need to run: docker pull aztecprotocol/build:3.0


function check_circuit_vks {
  set -eu
  local flow_folder="$inputs_dir/$1"
  local output
  local exit_code=0
  local -a bb_check_args=(check --scheme chonk --ivc_inputs_path "$flow_folder/ivc-inputs.msgpack")

  if [[ "$bb_preset" == "debug" ]]; then
    bb_check_args+=(--disable_asserts)
  fi

  output=$($bb "${bb_check_args[@]}" 2>&1) || exit_code=$?

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
  local flow_folder="$inputs_dir/$1"
  local prove_exit_code=0

  echo "Running proof test for $1..."
  $bb prove --scheme chonk --ivc_inputs_path "$flow_folder/ivc-inputs.msgpack" > /dev/null 2>&1 || prove_exit_code=$?

  if [[ $prove_exit_code -ne 0 ]]; then
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
      --download_pinned_inputs          Download pinned inputs to yarn-project for local debugging
      -h, --help                 Show this help message

  Description:
      Tests that Chonk standalone VKs haven't changed by comparing
      generated VKs with pinned reference inputs.
EOF
  exit 0
elif [[ "${1:-}" == "--update_inputs" ]]; then
    # Delegate to the regen orchestrator. It handles: building the yarn-project /
    # e2e prerequisites, regenerating inputs under example-app-ivc-inputs-out,
    # proving+verifying each flow, uploading the new tarball to S3, and rewriting
    # chonk-inputs.hash. It deliberately does NOT touch git so that a developer
    # can review the new hash before committing locally.
    exec "$script_dir/regenerate_chonk_inputs.sh" --no-commit
elif [[ "${1:-}" == "--download_pinned_inputs" ]]; then
    # Download pinned inputs to yarn-project for local debugging
    set -eu
    local_output_dir="$root/yarn-project/end-to-end/example-app-ivc-inputs-out"

    echo "Downloading pinned IVC inputs (hash: $pinned_short_hash) to $local_output_dir..."
    chonk_inputs_download "$local_output_dir" 1

    echo "Done. Inputs downloaded to: $local_output_dir"
    ls -la "$local_output_dir"
    exit 0
else
  export inputs_dir=$(mktemp -d)
  trap 'rm -rf "$inputs_dir"' EXIT SIGINT

  chonk_inputs_download "$inputs_dir" 1

  ls "$inputs_dir"

  if [[ "${1:-}" == "--prove_and_verify" ]]; then
    # Prove and verify the current pinned inputs
    prove_exit_code=0
    parallel -v --line-buffer --tag prove_and_verify_inputs {} ::: $(ls "$inputs_dir") || prove_exit_code=$?

    if [[ $prove_exit_code -ne 0 ]]; then
      echo "One or more flows failed the proof test after updating inputs. Please investigate."
      exit 1
    else
      echo "All inputs were successfully proven and verified."
    fi
    exit 0
  else
    exit_code=0
    parallel --joblog "$inputs_dir/joblog.log" -v --line-buffer --tag check_circuit_vks {} ::: $(ls "$inputs_dir") || true

    extract_exit_code "$inputs_dir/joblog.log" || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
      echo "No VK changes detected. Short hash is: ${pinned_short_hash}"
    elif [[ $exit_code -eq 1 ]]; then
      # All flows had VK changes
      cat >&2 <<'EOF'

VK changes detected.

To regenerate locally:
  ./barretenberg/cpp/scripts/test_chonk_standalone_vks_havent_changed.sh --update_inputs

Or push an empty commit to your PR and CI will regenerate and push the pin update for you:
  git commit --allow-empty -m "VK-UPDATE: <one-line reason VKs changed>"

CI rerun after the VK-UPDATE commit is added will run regenerate_chonk_inputs.sh, upload a new
S3 tarball, update barretenberg/cpp/scripts/chonk-inputs.hash, and push the result back to the
PR branch with [skip ci].
EOF
      exit 1
    else
      # At least one real error
      echo "Real error detected, please investigate."
      exit $exit_code
    fi
  fi
fi
