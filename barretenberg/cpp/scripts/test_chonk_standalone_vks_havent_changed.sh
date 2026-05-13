#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source "$(dirname "${BASH_SOURCE[0]}")/pinned_chonk_inputs.sh"

# Resolve bb from an explicit preset when provided, and fall back to known build dirs.
script_dir="$root/barretenberg/cpp/scripts"
bb_preset="${BB_BUILD_PRESET:-${NATIVE_PRESET:-clang20}}"
bb="$root/barretenberg/cpp/$($script_dir/preset-build-dir "$bb_preset")/bin/bb"

export bb_preset
export bb

# NOTE: We pin the captured IVC inputs to a known good commit, exploiting that
# they change infrequently. This script compares VKs derived from those pinned
# inputs to the ones the current source tree would compute, detecting breaking
# protocol changes. When a VK change is expected, run `/update-chonk-inputs` on
# the PR (or this script with --update_inputs locally). The pin itself lives in
# barretenberg/cpp/scripts/pinned_chonk_inputs.sh.
# Note: In case of the "Test suite failed to run ... Unexpected token 'with' "
# error, run: docker pull aztecprotocol/build:3.0

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
      --download_pinned_inputs   Download pinned inputs to yarn-project for local debugging
      -h, --help                 Show this help message

  Description:
      Tests that Chonk standalone VKs haven't changed by comparing
      generated VKs with pinned reference inputs.
EOF
  exit 0
elif [[ "${1:-}" == "--update_inputs" ]]; then
  # Full regen path. Delegates to yarn-project/end-to-end/bootstrap.sh build_bench,
  # which now owns the regen + S3 upload + pin update (when UPDATE_CHONK_INPUTS=1
  # is set). Running this script with --update_inputs is the local-developer
  # equivalent of triggering /update-chonk-inputs in CI.
  set -eu
  echo "Updating pinned IVC inputs locally ..."
  cd "$root"
  ./bootstrap.sh pull_submodules
  make yarn-project
  cd yarn-project/end-to-end
  UPDATE_CHONK_INPUTS=1 ./bootstrap.sh build_bench

  inputs_dir="$(pinned_chonk_inputs_dir)"
  export inputs_dir
  prove_exit_code=0
  parallel -v --line-buffer --tag prove_and_verify_inputs {} ::: $(ls "$inputs_dir") || prove_exit_code=$?
  if [[ $prove_exit_code -eq 1 ]]; then
    echo "One or more flows failed the proof test after updating inputs. Please investigate."
    exit 1
  fi
  echo "Inputs successfully updated. New pin: ${pinned_chonk_inputs_hash}."
  exit 0
elif [[ "${1:-}" == "--download_pinned_inputs" ]]; then
  set -eu
  download_pinned_chonk_inputs "$(pinned_chonk_inputs_dir)"
  echo "Done. Inputs downloaded to: $(pinned_chonk_inputs_dir)"
  ls -la "$(pinned_chonk_inputs_dir)"
  exit 0
else
  export inputs_dir=$(mktemp -d)
  trap 'rm -rf "$inputs_dir"' EXIT SIGINT

  download_pinned_chonk_inputs "$inputs_dir"
  ls "$inputs_dir"

  if [[ "${1:-}" == "--prove_and_verify" ]]; then
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
      echo "No VK changes detected. Pinned hash is: ${pinned_chonk_inputs_hash}"
    elif [[ $exit_code -eq 1 ]]; then
      # All flows had VK changes
      echo "VK changes detected. Run /update-chonk-inputs on the PR (or this script with --update_inputs locally)."
      exit 1
    else
      # At least one real error
      echo "Real error detected, please investigate."
      exit $exit_code
    fi
  fi
fi
