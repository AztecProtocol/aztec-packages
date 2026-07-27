#!/usr/bin/env bash
# Performs the chonk private transaction proving benchmarks for our 'realistic apps'.
# Downloads the pinned inputs itself when the requested flow is missing or stale.
REPO_ROOT=$(git rev-parse --show-toplevel)
NO_CD=1 source "$REPO_ROOT/ci3/source"
source "$REPO_ROOT/ci3/source_redis"
source "$REPO_ROOT/ci3/source_cache"
source "$REPO_ROOT/barretenberg/cpp/scripts/pinned_chonk_inputs.sh"

default_chonk_flow="ecdsar1+transfer_0_recursions+sponsored_fpc"

function usage {
  echo "Usage: $0 [native|wasm] [benchmark_folder]"
  echo "Defaults to native ${default_chonk_flow} from the pinned Chonk inputs."
}

case $# in
  0)
    runtime_arg="native"
    flow_folder_arg="$(pinned_chonk_inputs_dir)/$default_chonk_flow"
    ;;
  1)
    runtime_arg="$1"
    flow_folder_arg="$(pinned_chonk_inputs_dir)/$default_chonk_flow"
    ;;
  2)
    runtime_arg="$1"
    flow_folder_arg="${2%/}"
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
case "$runtime_arg" in
  native|wasm) ;;
  *) usage >&2; exit 1 ;;
esac
caller_dir="$PWD"

function resolve_flow_folder_arg {
  local requested="${1%/}"
  if [[ "$requested" == /* ]]; then
    realpath -m "$requested"
    return
  fi

  local caller_path="$caller_dir/$requested"
  if [[ -e "$caller_path" ]]; then
    realpath -m "$caller_path"
    return
  fi

  realpath -m "$REPO_ROOT/barretenberg/cpp/$requested"
}

flow_folder_arg="$(resolve_flow_folder_arg "$flow_folder_arg")"

cd "$REPO_ROOT/barretenberg/cpp"

echo_header "bb ivc flow bench"

export HARDWARE_CONCURRENCY=${CPUS:-8}
# E.g. build, build-debug or build-coverage
export native_build_dir=$(scripts/preset-build-dir)
resolved_chonk_flow_folder=""

function ensure_chonk_flow_folder {
  local requested="$1"
  local flow
  flow="$(basename "$requested")"

  ensure_pinned_chonk_inputs "$(pinned_chonk_inputs_dir)"

  local canonical_flow_folder=""
  if canonical_flow_folder="$(pinned_chonk_input_flow_dir "$flow" "$(pinned_chonk_inputs_dir)")"; then
    if [[ -f "$requested/ivc-inputs.msgpack" ]]; then
      if [[ "$(realpath -m "$requested")" != "$(realpath -m "$canonical_flow_folder")" ]]; then
        if [[ "${ALLOW_UNPINNED_CHONK_INPUTS:-0}" != "1" ]]; then
          echo_stderr "ERROR: $requested is not the pinned Chonk input flow for '$flow'."
          echo_stderr "Use the pinned flow at $canonical_flow_folder, or set ALLOW_UNPINNED_CHONK_INPUTS=1 for a local override."
          exit 1
        fi
        resolved_chonk_flow_folder="$requested"
        return
      fi
    fi
    resolved_chonk_flow_folder="$canonical_flow_folder"
    return
  fi

  echo_stderr "ERROR: pinned Chonk input flow '$flow' was not found at $requested or $(pinned_chonk_inputs_dir)/$flow"
  exit 1
}

function verify_ivc_flow {
  local runtime="$1"
  local flow="$2"
  local proof="$3"
  # Check that this verifies with one of our verification keys and fails with the other.
  # NOTE: This is effectively a test.
  # TODO(AD): Checking which one would be good, but there isn't too much that can go wrong here.
  set +e

  # Extract VK bytes from JSON artifacts and convert to binary
  local circuits_target="../../noir-projects/fnd/noir-protocol-circuits/target"
  local rollup_vk_json="$circuits_target/hiding_kernel_to_rollup.json"
  local public_vk_json="$circuits_target/hiding_kernel_to_public.json"
  if [[ ! -f "$rollup_vk_json" || ! -f "$public_vk_json" ]]; then
    echo_stderr "Pinned inputs for this flow remain at $(pinned_chonk_inputs_dir)/$flow/ivc-inputs.msgpack"
    echo_stderr "Rerun with: barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh $runtime '$(pinned_chonk_inputs_dir)/$flow'"
    if [[ "${CI:-0}" == "1" || "${REQUIRE_IVC_FLOW_KEY_VERIFY:-0}" == "1" ]]; then
      echo_stderr "Verification key artifacts are missing under $circuits_target."
      echo_stderr "Build noir-projects/fnd/noir-protocol-circuits before running this benchmark."
      exit 1
    fi
    echo "proof completed; protocol VK check skipped because $circuits_target has not been built."
    return 0
  fi

  local rollup_vk=$(mktemp)
  local public_vk=$(mktemp)
  jq -r '.verificationKey.bytes' "$rollup_vk_json" | xxd -r -p > "$rollup_vk"
  jq -r '.verificationKey.bytes' "$public_vk_json" | xxd -r -p > "$public_vk"

  echo_stderr "Private verify."
  "./$native_build_dir/bin/bb" verify --scheme chonk -p "$proof" -k "$rollup_vk" 1>&2
  local private_result=$?
  echo_stderr "Private verify: $private_result."
  "./$native_build_dir/bin/bb" verify --scheme chonk -p "$proof" -k "$public_vk" 1>&2
  local public_result=$?
  echo_stderr "Public verify: $public_result."

  rm -f "$rollup_vk" "$public_vk"

  if [[ $private_result -eq $public_result ]]; then
    echo_stderr "Verification failed for $flow. Both keys returned $private_result - only one should."
    exit 1
  fi
  if [[ $private_result -ne 0 ]] && [[ $public_result -ne 0 ]]; then
    echo_stderr "Verification failed for $flow. Did not verify with precalculated verification key - we may need to revisit how it is generated in noir-projects/fnd/noir-protocol-circuits."
    exit 1
  fi
  echo "protocol VK check passed."
}

function print_chonk_flow_reuse_hint {
  local runtime="$1"
  local flow_folder="$2"
  local flow
  flow="$(basename "$flow_folder")"
  echo_stderr "Pinned inputs for this flow remain at $flow_folder/ivc-inputs.msgpack"
  echo_stderr "Rerun with: barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh $runtime '$(pinned_chonk_inputs_dir)/$flow'"
}

function run_bb_cli_bench {
  local runtime="$1"
  local output="$2"
  shift 2

  if [[ "$runtime" == "native" ]]; then
    # Add --bench_out_hierarchical flag for native builds to capture hierarchical op counts and timings
    memusage "./$native_build_dir/bin/bb" "$@" "--bench_out_hierarchical" "$output/benchmark_breakdown.json" "--memory_profile_out" "$output/memory_profile.json" || {
      echo "bb native failed with args: $@ --bench_out_hierarchical $output/benchmark_breakdown.json --memory_profile_out $output/memory_profile.json"
      print_chonk_flow_reuse_hint "$runtime" "$flow_folder"
      exit 1
    }
  else # wasm
    export WASMTIME_ALLOWED_DIRS="--dir=$flow_folder --dir=$output"
    # No --bench_out_hierarchical or --memory_profile_out here: BB_BENCH instrumentation is compiled out
    # of wasm builds (ENABLE_WASM_BENCH is OFF in the wasm-threads preset to keep the shipped wasm fast),
    # and --memory_profile_out is native-only (getrusage not available in wasm).
    # Only wall-clock time and peak memory are measured for wasm.
    memusage scripts/wasmtime.sh $WASMTIME_ALLOWED_DIRS ./build-wasm-threads/bin/bb "$@" || {
      echo "bb wasm failed with args: $@"
      print_chonk_flow_reuse_hint "$runtime" "$flow_folder"
      exit 1
    }
  fi
}

function chonk_flow {
  set -eu
  local runtime="$1"
  local flow_folder="$2"
  local flow="$(basename $flow_folder)"
  local start=$(date +%s%N)

  local name_path="app-proving/$flow/$runtime"
  local output="bench-out/$name_path"
  rm -rf "$output"
  mkdir -p "$output"
  export MEMUSAGE_OUT="$output/peak-memory-mb.txt"

  run_bb_cli_bench "$runtime" "$output" prove -o $output --ivc_inputs_path $flow_folder/ivc-inputs.msgpack --scheme chonk -v --print_bench

  local end=$(date +%s%N)
  local elapsed_ns=$(( end - start ))
  local elapsed_ms=$(( elapsed_ns / 1000000 ))
  local memory_taken_mb=$(cat "$MEMUSAGE_OUT")

  echo "$flow ($runtime) has proven in $((elapsed_ms / 1000))s and peak memory of ${memory_taken_mb}MB."
  local verification_status
  verification_status="$(dump_fail "verify_ivc_flow $runtime $flow $output/proof")"
  echo "$flow ($runtime): $verification_status"
  # Get proof size after compression
  tar -czf "$output/proof.tar.gz" -C "$output" proof
  local proof_size_bytes=$(stat -c%s "$output/proof.tar.gz" 2>/dev/null || stat -f%z "$output/proof.tar.gz")
  local proof_size_kb=$(( proof_size_bytes / 1024 ))

  # Get compressed proof size and number of public inputs via bb proof_stats
  # proof_stats writes proof_stats.json (metadata) and proof_stats.bin (compressed proof + public inputs)
  "./$native_build_dir/bin/bb" proof_stats --scheme chonk -p "$output/proof" -o "$output/proof_stats.json"
  # Gzip the compressed proof + public inputs (same treatment as the raw proof above)
  tar -czf "$output/proof_stats.tar.gz" -C "$output" proof_stats.bin
  local compressed_proof_size_bytes=$(stat -c%s "$output/proof_stats.tar.gz" 2>/dev/null || stat -f%z "$output/proof_stats.tar.gz")
  local compressed_proof_size_kb=$(( compressed_proof_size_bytes / 1024 ))

  cat > "$output/benchmarks.bench.json" <<EOF
[
  {
    "name": "$name_path/seconds",
    "unit": "ms",
    "value": ${elapsed_ms}
  },
  {
    "name": "$name_path/memory",
    "unit": "MB",
    "value": ${memory_taken_mb}
  },
  {
    "name": "$name_path/proof-size",
    "unit": "KB",
    "value": ${proof_size_kb}
  },
  {
    "name": "$name_path/compressed-proof-size",
    "unit": "KB",
    "value": ${compressed_proof_size_kb}
  }
]
EOF

  # Extract component timings from hierarchical breakdown if available
  if [[ -f "$output/benchmark_breakdown.json" ]]; then
    echo "Extracting component timings from hierarchical breakdown..."
    python3 scripts/extract_component_benchmarks.py "$output" "$name_path"
  fi

  # Extract memory profile metrics if available
  if [[ -f "$output/memory_profile.json" ]]; then
    echo "Extracting memory profile metrics..."
    python3 scripts/extract_memory_benchmarks.py "$output" "$name_path"
  fi
}

export -f verify_ivc_flow print_chonk_flow_reuse_hint run_bb_cli_bench

ensure_chonk_flow_folder "$flow_folder_arg"
chonk_flow "$runtime_arg" "$resolved_chonk_flow_folder"

# Upload benchmark breakdown (op counts and timings) to disk if running in CI
# Now uploads all flows via disk transfer only (no git uploads)
runtime="$runtime_arg"
flow_name="$(basename "$resolved_chonk_flow_folder")"

# Breakdown and memory profile only exist for native runs (BB_BENCH is compiled out of wasm builds).
if [[ "$runtime" == "native" ]] && [[ "${CI:-}" == "1" ]] && [[ "${CI_USE_BUILD_INSTANCE_KEY:-0}" == "1" ]]; then
  echo_header "Uploading Barretenberg benchmark breakdowns for $flow_name"

  current_sha=$(git rev-parse HEAD)
  benchmark_breakdown_file="bench-out/app-proving/$flow_name/$runtime/benchmark_breakdown.json"

  if [[ -f "$benchmark_breakdown_file" ]]; then
    # TODO(AD): make this robust. not erroring if this breaks is not great.
    set +e

    upload_state_dir="$(make_pinned_chonk_state_tmpdir benchmark-upload)"
    tmp_breakdown_file="$upload_state_dir/benchmark_breakdown_${runtime}_${flow_name}.json"
    # Other flows might delete bench-out before we finish uploading
    cp "$benchmark_breakdown_file" "$tmp_breakdown_file"

    # Upload to S3 (bench/bb-breakdown subfolder) in background
    # Key format: <runtime>-<flow_name>-<sha>
    disk_key="${runtime}-${flow_name}-${current_sha}"
    {
      cat "$tmp_breakdown_file" | gzip | cache_s3_transfer_to "bench/bb-breakdown" "$disk_key"
      rm -rf "$upload_state_dir"
    } &

    echo "Uploaded benchmark breakdown to S3: bench/bb-breakdown/$disk_key"
  else
    echo "Warning: benchmark breakdown file not found at $benchmark_breakdown_file"
  fi

  # Upload memory profile to S3
  memory_profile_file="bench-out/app-proving/$flow_name/$runtime/memory_profile.json"
  if [[ -f "$memory_profile_file" ]]; then
    upload_state_dir="$(make_pinned_chonk_state_tmpdir memory-upload)"
    tmp_memory_file="$upload_state_dir/memory_profile_${runtime}_${flow_name}.json"
    cp "$memory_profile_file" "$tmp_memory_file"
    memory_disk_key="memory-${runtime}-${flow_name}-${current_sha}"
    {
      cat "$tmp_memory_file" | gzip | cache_s3_transfer_to "bench/bb-breakdown" "$memory_disk_key"
      rm -rf "$upload_state_dir"
    } &
    echo "Uploaded memory profile to S3: bench/bb-breakdown/$memory_disk_key"
  fi
fi
