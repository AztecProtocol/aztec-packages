#!/usr/bin/env bash
# Single owner of the pinned Chonk IVC inputs lifecycle.
#
# The current pin lives in chonk-inputs.hash next to this script. The tarball is
# stored as bb-chonk-inputs-<hash_prefix>.tar.gz under the protocol artifact
# bucket.
#
# Subcommands:
#   download [dir]    Download and extract pinned inputs. Defaults to the canonical e2e fixture dir.
#   update            Capture generated flows, then upload and pin them.
#   check             Download pinned inputs to a scratch dir and run bb check over every flow.
#   help              Show this help.
set -euo pipefail

own_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NO_CD=1 source "$(git rev-parse --show-toplevel)/ci3/source"
source "$own_dir/pinned_chonk_inputs.sh"

script_dir="$root/barretenberg/cpp/scripts"
bb_preset="${BB_BUILD_PRESET:-${NATIVE_PRESET:-clang20}}"
# Re-derives each circuit's VK from its bytecode and compares it to the precomputed VK in ivc-inputs.msgpack
bb="$("$script_dir/find-bb")"
export bb_preset
export bb

function usage {
  awk '
    NR == 1 { next }
    /^set -euo pipefail$/ { exit }
    /^#/ { sub(/^# ?/, ""); print; next }
    /^$/ { print }
  ' "$0"
}

function require_bb {
  if [[ ! -x "$bb" ]]; then
    echo_stderr "ERROR: bb binary not found at $bb"
    echo_stderr "Build it first, or set BB_BUILD_PRESET/NATIVE_PRESET to the preset containing bin/bb."
    return 1
  fi
}

function cmd_download {
  local dest=${1:-$(pinned_chonk_inputs_dir)}
  ensure_pinned_chonk_inputs "$dest"
  check_pinned_chonk_inputs "$dest"
  echo "Pinned Chonk inputs ${pinned_chonk_inputs_hash} ready at: $dest"
}

function capture_inputs {
  if [[ -n "${CHONK_INPUTS_CAPTURE_FROM:-}" ]]; then
    local inputs_dir
    inputs_dir="$(chonk_capture_dir)"
    echo "Using pre-captured Chonk inputs from ${CHONK_INPUTS_CAPTURE_FROM}"
    rm -rf "$inputs_dir"
    mkdir -p "$inputs_dir"
    cp -a "${CHONK_INPUTS_CAPTURE_FROM}/." "$inputs_dir/"
    check_chonk_inputs_shape "$inputs_dir"
    return
  fi

  echo "Running live Chonk input capture via yarn-project/end-to-end build_bench_capture..."
  cd "$root"
  ./bootstrap.sh pull_submodules
  make yarn-project
  # The capture's getBBConfig defaults to bin/bb-avm but silently falls back to non-AVM
  # proving when it is absent, baking stale public-path VKs (e.g. the public hiding kernel
  # used by deploy flows) into the fixtures. Build just that binary so the capture uses AVM
  # (cmake_build forwards --target; build_preset would ignore it and rebuild the whole preset).
  barretenberg/cpp/bootstrap.sh cmake_build "$bb_preset" --target bb-avm
  cd "$root/yarn-project/end-to-end"
  ./bootstrap.sh build_bench_capture
}

function check_circuit_vks {
  set -eu
  local flow_folder="$work_dir/$1"
  local output
  local exit_code=0
  local -a bb_check_args=(check --scheme chonk --ivc_inputs_path "$flow_folder/ivc-inputs.msgpack")

  output="$("$bb" "${bb_check_args[@]}" 2>&1)" || exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    if echo "$output" | grep -q "VK mismatch detected\|Expected precomputed vk"; then
      echo "Error: VK change detected in $flow_folder" >&2
      echo "$output" >&2
      exit 1
    fi

    echo "Error: bb check failed in $flow_folder (not a VK change)" >&2
    echo "$output" >&2
    exit 2
  fi
}
export -f check_circuit_vks

function extract_parallel_exit_code {
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

  case "$exit_code" in
    0) return 0 ;;
    1) return 1 ;;
    *) return 2 ;;
  esac
}

function cmd_check {
  require_bb
  local exit_code=0
  export work_dir
  work_dir="$(reset_pinned_chonk_state_subdir downloaded)"
  trap "rm -rf '$work_dir'" RETURN
  download_pinned_chonk_inputs "$work_dir"
  check_pinned_chonk_inputs "$work_dir"

  mapfile -t flows < <(list_pinned_chonk_input_flows "$work_dir")
  parallel --joblog "$work_dir/joblog.log" -v --line-buffer --tag check_circuit_vks {} ::: "${flows[@]}" || true
  extract_parallel_exit_code "$work_dir/joblog.log" || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    echo "No VK changes detected. Pinned hash is: ${pinned_chonk_inputs_hash}"
  elif [[ $exit_code -eq 1 ]]; then
    echo_stderr "VK changes detected. Add the ci-refresh-chonk label to the PR, put --ci-refresh-chonk in the head commit message, or run this script with update locally."
    exit 1
  else
    echo_stderr "Real error detected, please investigate."
    exit "$exit_code"
  fi
}

# Verify every freshly captured flow's embedded VKs against the current bb before pinning.
# Mirrors cmd_check, but over the live capture dir rather than a downloaded pin.
function verify_captured_flows {
  local capture_dir=${1:?capture dir required}
  export work_dir="$capture_dir"
  local exit_code=0
  mapfile -t flows < <(list_chonk_input_flow_dirs "$capture_dir")
  if [[ ${#flows[@]} -eq 0 ]]; then
    echo_stderr "ERROR: no captured Chonk flows found under $capture_dir to verify."
    return 1
  fi
  parallel --joblog "$capture_dir/joblog.log" -v --line-buffer --tag check_circuit_vks {} ::: "${flows[@]}" || true
  extract_parallel_exit_code "$capture_dir/joblog.log" || exit_code=$?
  return "$exit_code"
}

function cmd_update {
  capture_inputs

  # Gate the upload on a full VK check: a capture that baked in a stale VK fails here
  # instead of shipping as a broken pin.
  local capture_dir exit_code=0
  capture_dir="$(chonk_capture_dir)"
  verify_captured_flows "$capture_dir" || exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    echo_stderr "ERROR: captured Chonk inputs failed VK verification (exit ${exit_code}); not pinning."
    return "$exit_code"
  fi

  local new_hash
  new_hash="$(upload_and_pin_chonk_inputs "$capture_dir" | tail -1)"
  echo "Pinned Chonk inputs refreshed to ${new_hash}."
}

cmd="${1:-help}"
shift || true

case "$cmd" in
  download) cmd_download "$@" ;;
  update) cmd_update "$@" ;;
  check) cmd_check "$@" ;;
  help|-h|--help) usage ;;
  *) echo_stderr "Unknown subcommand: $cmd"; usage; exit 2 ;;
esac
