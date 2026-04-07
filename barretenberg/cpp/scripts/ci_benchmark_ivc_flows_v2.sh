#!/usr/bin/env bash
# Performs the ChonkV2 (deferred Poseidon2) private transaction proving benchmarks.
# Mirrors ci_benchmark_ivc_flows.sh but uses --scheme chonk_v2 instead of chonk.
# This is for benchmarking purposes — verification is skipped (ChonkV2 proof format differs).
source $(git rev-parse --show-toplevel)/ci3/source
source $(git rev-parse --show-toplevel)/ci3/source_redis
source $(git rev-parse --show-toplevel)/ci3/source_cache

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <runtime> <benchmark_folder>"
  exit 1
fi
cd ..

echo_header "bb ivc flow bench (ChonkV2)"

export HARDWARE_CONCURRENCY=${CPUS:-8}
export native_build_dir=$(scripts/native-preset-build-dir)

function run_bb_cli_bench {
  local runtime="$1"
  local output="$2"
  shift 2

  if [[ "$runtime" == "native" ]]; then
    memusage "./$native_build_dir/bin/bb" "$@" "--bench_out_hierarchical" "$output/benchmark_breakdown.json" || {
      echo "bb native failed with args: $@ --bench_out_hierarchical $output/benchmark_breakdown.json"
      exit 1
    }
  else # wasm
    export WASMTIME_ALLOWED_DIRS="--dir=$flow_folder --dir=$output"
    memusage scripts/wasmtime.sh $WASMTIME_ALLOWED_DIRS ./build-wasm-threads/bin/bb "$@" "--bench_out_hierarchical" "$output/benchmark_breakdown.json" || {
      echo "bb wasm failed with args: $@ --bench_out_hierarchical $output/benchmark_breakdown.json"
      exit 1
    }
  fi
}

function chonk_v2_flow {
  set -eu
  local runtime="$1"
  local flow_folder="$2"
  local flow="$(basename $flow_folder)"
  local start=$(date +%s%N)

  local name_path="app-proving-v2/$flow/$runtime"
  local output="bench-out/$name_path"
  rm -rf "$output"
  mkdir -p "$output"
  export MEMUSAGE_OUT="$output/peak-memory-mb.txt"

  # Use --scheme chonk_v2 to trigger deferred Poseidon2 path
  run_bb_cli_bench "$runtime" "$output" prove -o $output --ivc_inputs_path $flow_folder/ivc-inputs.msgpack --scheme chonk_v2 -v --print_bench

  local end=$(date +%s%N)
  local elapsed_ns=$(( end - start ))
  local elapsed_ms=$(( elapsed_ns / 1000000 ))
  local memory_taken_mb=$(cat "$MEMUSAGE_OUT")

  echo "$flow ($runtime) ChonkV2 has proven in $((elapsed_ms / 1000))s and peak memory of ${memory_taken_mb}MB."

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
  }
]
EOF

  # Extract component timings from hierarchical breakdown if available
  if [[ -f "$output/benchmark_breakdown.json" ]]; then
    echo "Extracting component timings from hierarchical breakdown..."
    python3 scripts/extract_component_benchmarks.py "$output" "$name_path"
  fi
}

export -f run_bb_cli_bench

chonk_v2_flow $1 $2

# Upload benchmark breakdown if running in CI
runtime="$1"
flow_name="$(basename $2)"

if [[ "${CI:-}" == "1" ]] && [[ "${CI_USE_BUILD_INSTANCE_KEY:-0}" == "1" ]]; then
  echo_header "Uploading Barretenberg ChonkV2 benchmark breakdowns for $flow_name"

  benchmark_breakdown_file="bench-out/app-proving-v2/$flow_name/$runtime/benchmark_breakdown.json"

  if [[ -f "$benchmark_breakdown_file" ]]; then
    set +e
    current_sha=$(git rev-parse HEAD)

    tmp_breakdown_file="/tmp/benchmark_breakdown_v2_${runtime}_${flow_name}_$$.json"
    cp "$benchmark_breakdown_file" "$tmp_breakdown_file"

    disk_key="v2-${runtime}-${flow_name}-${current_sha}"
    {
      cat "$tmp_breakdown_file" | gzip | cache_disk_transfer_to "bench/bb-breakdown" "$disk_key"
      rm -f "$tmp_breakdown_file"
    } &

    echo "Uploaded ChonkV2 benchmark breakdown to disk: bench/bb-breakdown/$disk_key"
  else
    echo "Warning: benchmark breakdown file not found at $benchmark_breakdown_file"
  fi
fi
