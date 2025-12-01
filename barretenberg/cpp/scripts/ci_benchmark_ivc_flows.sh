#!/usr/bin/env bash
# Performs the chonk private transaction proving benchmarks for our 'realistic apps'.
# This is called by yarn-project/end-to-end/bootstrap.sh bench, which creates these inputs from end-to-end tests.
source $(git rev-parse --show-toplevel)/ci3/source
source $(git rev-parse --show-toplevel)/ci3/source_redis
source $(git rev-parse --show-toplevel)/ci3/source_cache

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <runtime> <benchmark_folder>"
  exit 1
fi
cd ..

echo_header "bb ivc flow bench"

export HARDWARE_CONCURRENCY=${CPUS:-8}
# E.g. build, build-debug or build-coverage
export native_build_dir=$(scripts/native-preset-build-dir)

function verify_ivc_flow {
  local flow="$1"
  local proof="$2"
  # Check that this verifies with one of our verification keys and fails with the other.
  # NOTE: This is effectively a test.
  # TODO(AD): Checking which one would be good, but there isn't too much that can go wrong here.
  set +e
  echo_stderr "Private verify."
  "./$native_build_dir/bin/bb" verify --scheme chonk -p "$proof" -k ../../noir-projects/noir-protocol-circuits/target/keys/hiding_kernel_to_rollup.ivc.vk 1>&2
  local private_result=$?
  echo_stderr "Private verify: $private_result."
  "./$native_build_dir/bin/bb" verify --scheme chonk -p "$proof" -k ../../noir-projects/noir-protocol-circuits/target/keys/hiding_kernel_to_public.ivc.vk 1>&2
  local public_result=$?
  echo_stderr "Public verify: $public_result."
  if [[ $private_result -eq $public_result ]]; then
    echo_stderr "Verification failed for $flow. Both keys returned $private_result - only one should."
    exit 1
  fi
  if [[ $private_result -ne 0 ]] && [[ $public_result -ne 0 ]]; then
    echo_stderr "Verification failed for $flow. Did not verify with precalculated verification key - we may need to revisit how it is generated in noir-projects/noir-protocol-circuits."
    exit 1
  fi
}

function run_bb_cli_bench {
  local runtime="$1"
  local output="$2"
  shift 2

  if [[ "$runtime" == "native" ]]; then
    # Add --bench_out_hierarchical flag for native builds to capture hierarchical op counts and timings
    memusage "./$native_build_dir/bin/bb" "$@" "--bench_out_hierarchical" "$output/benchmark_breakdown.json" || {
      echo "bb native failed with args: $@ --bench_out_hierarchical $output/benchmark_breakdown.json"
      exit 1
    }
  else # wasm
    export WASMTIME_ALLOWED_DIRS="--dir=$flow_folder --dir=$output"
    # Add --bench_out_hierarchical flag for wasm builds to capture hierarchical op counts and timings
    memusage scripts/wasmtime.sh $WASMTIME_ALLOWED_DIRS ./build-wasm-threads/bin/bb "$@" "--bench_out_hierarchical" "$output/benchmark_breakdown.json" || {
      echo "bb wasm failed with args: $@ --bench_out_hierarchical $output/benchmark_breakdown.json"
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
  dump_fail "verify_ivc_flow $flow $output/proof"
  echo "$flow ($runtime) has verified."
  # Get proof size after compression
  tar -czf "$output/proof.tar.gz" -C "$output" proof
  local proof_size_bytes=$(stat -c%s "$output/proof.tar.gz" 2>/dev/null || stat -f%z "$output/proof.tar.gz")
  local proof_size_kb=$(( proof_size_bytes / 1024 ))

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
  }
]
EOF
}

export -f verify_ivc_flow run_bb_cli_bench

chonk_flow $1 $2

# Upload benchmark breakdown (op counts and timings) to disk if running in CI
# Now uploads all flows via disk transfer only (no git uploads)
runtime="$1"
flow_name="$(basename $2)"

if [[ "${CI:-}" == "1" ]] && [[ "${CI_ENABLE_DISK_LOGS:-0}" == "1" ]]; then
  echo_header "Uploading Barretenberg benchmark breakdowns for $flow_name"

  benchmark_breakdown_file="bench-out/app-proving/$flow_name/$runtime/benchmark_breakdown.json"

  if [[ -f "$benchmark_breakdown_file" ]]; then
    # TODO(AD): make this robust. not erroring if this breaks is not great.
    set +e
    current_sha=$(git rev-parse HEAD)

    # Copy to /tmp with unique name to avoid race conditions with concurrent flows
    # Other flows might delete bench-out before we finish uploading
    tmp_breakdown_file="/tmp/benchmark_breakdown_${runtime}_${flow_name}_$$.json"
    cp "$benchmark_breakdown_file" "$tmp_breakdown_file"

    # Upload to disk (bench/bb-breakdown subfolder) in background
    # Key format: <runtime>-<flow_name>-<sha>
    disk_key="${runtime}-${flow_name}-${current_sha}"
    {
      cat "$tmp_breakdown_file" | gzip | cache_disk_transfer_to "bench/bb-breakdown" "$disk_key"
      # Clean up tmp file after upload completes
      rm -f "$tmp_breakdown_file"
    } &

    echo "Uploaded benchmark breakdown to disk: bench/bb-breakdown/$disk_key"
  else
    echo "Warning: benchmark breakdown file not found at $benchmark_breakdown_file"
  fi
fi
