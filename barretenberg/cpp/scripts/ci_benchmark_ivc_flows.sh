#!/usr/bin/env bash
# Performs the client ivc private transaction proving benchmarks for our 'realistic apps'.
# This is called by yarn-project/end-to-end/bootstrap.sh bench, which creates these inputs from end-to-end tests.
source $(git rev-parse --show-toplevel)/ci3/source

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <bench_input_folder> <benchmark_output>"
  exit 1
fi
cd ..
export input_folder="$1"
benchmark_output="$2"

echo_header "bb ivc flow bench"

export HARDWARE_CONCURRENCY=16
export native_preset=${NATIVE_PRESET:-clang16-assert}
export native_build_dir=$(scripts/cmake/preset-build-dir $native_preset)

mkdir -p bench-out
rm -rf bench-out/ivc-*

function verify_ivc_flow {
  local flow="$1"
  local proof="$2"
  # Check that this verifies with one of our verification keys and fails with the other.
  # NOTE: This is effectively a test.
  # TODO(AD): Checking which one would be good, but there isn't too much that can go wrong here.
  set +e
  echo_stderr "Private verify."
  "./$native_build_dir/bin/bb" verify --scheme client_ivc -p "$proof" -k ../../yarn-project/bb-prover/artifacts/private-civc-vk 1>&2
  local private_result=$?
  echo_stderr "Private verify: $private_result."
  "./$native_build_dir/bin/bb" verify --scheme client_ivc -p "$proof" -k ../../yarn-project/bb-prover/artifacts/public-civc-vk 1>&2
  local public_result=$?
  echo_stderr "Public verify: $public_result."
  if [[ $private_result -eq $public_result ]]; then
    echo_stderr "Verification failed for $flow. Both keys returned $private_result - only one should."
    exit 1
  fi
  if [[ $private_result -ne 0 ]] && [[ $public_result -ne 0 ]]; then
    echo_stderr "Verification failed for $flow. Did not verify with precalculated verification key - we may need to revisit how it is generated in yarn-project/bb-prover."
    exit 1
  fi
}

function run_bb_cli_bench {
  local runtime="$1"
  local output="$2"
  local args="$3"
  export MAIN_ARGS="$args"

  if [[ "$runtime" == "native" ]]; then
    memusage "./$native_build_dir/bin/bb_cli_bench" \
      --benchmark_out=$output/op-counts.json \
      --benchmark_out_format=json || {
      echo "bb_cli_bench native failed with args: $args"
      exit 1
    }
  else # wasm
    export WASMTIME_ALLOWED_DIRS="--dir=$flow_folder --dir=$output"
    # TODO support wasm op count time preset
    memusage scripts/wasmtime.sh $WASMTIME_ALLOWED_DIRS ./build-wasm-threads/bin/bb_cli_bench \
      --benchmark_out=$output/op-counts.json \
      --benchmark_out_format=json || {
      echo "bb_cli_bench wasm failed with args: $args"
      exit 1
    }
  fi
}

function client_ivc_flow {
  set -eu
  local runtime="$1"
  local flow="$2"
  local flow_folder="$input_folder/$flow"
  local start=$(date +%s%N)

  local output="bench-out/ivc-$flow-$runtime"
  rm -rf "$output"
  mkdir -p "$output"
  export MEMUSAGE_OUT="$output/peak-memory-$runtime-mb.txt"

  run_bb_cli_bench "$runtime" "$output" "prove -o $output --ivc_inputs_path $flow_folder/ivc-inputs.msgpack --scheme client_ivc"

  #if [ -f "$output/op-counts.json" ] && [ "$runtime" != wasm ]; then
  #  python3 scripts/analyze_client_ivc_bench.py --prefix . --json $output/op-counts.json --benchmark ""
  #fi

  local end=$(date +%s%N)
  local elapsed_ns=$(( end - start ))
  local elapsed_ms=$(( elapsed_ns / 1000000 ))
  local memory_taken_mb=$(cat "$MEMUSAGE_OUT")

  echo "$flow ($runtime) has proven in $((elapsed_ms / 1000))s and peak memory of ${memory_taken_mb}MB."
  dump_fail "verify_ivc_flow $flow $output/proof"
  echo "$flow ($runtime) has verified."

  local runtime_suffix=""
  [[ "$runtime" == "wasm" ]] && runtime_suffix="-wasm"

  cat > "$output/benchmarks.json" <<EOF
  {
    "benchmarks": [
    {
      "name": "$flow-ivc-proof$runtime_suffix",
      "time_unit": "ms",
      "real_time": ${elapsed_ms}
    },
    {
      "name": "$flow-ivc-proof$runtime_suffix-memory",
      "time_unit": "MB",
      "real_time": ${memory_taken_mb}
    }
    ]
  }
EOF
}

function run_benchmark {
  set -eu
  local start_core=$(( ($1 - 1) * HARDWARE_CONCURRENCY ))
  local end_core=$(( start_core + (HARDWARE_CONCURRENCY - 1) ))
  echo taskset -c $start_core-$end_core bash -c "$2"
  taskset -c $start_core-$end_core bash -c "$2"
}

export -f verify_ivc_flow client_ivc_flow run_bb_cli_bench run_benchmark

# TODO this does not work with smaller core counts - we will soon have a benchmark-wide mechanism for this.
num_cpus=$(get_num_cpus)
jobs=$((num_cpus / HARDWARE_CONCURRENCY))

# Split up the flows into chunks to run in parallel - otherwise we run out of CPUs to pin.
if [ -n "${IVC_BENCH:-}" ]; then
  # If IVC_BENCH is set, run only that benchmark.
  run_benchmark 1 "client_ivc_flow native $IVC_BENCH"
  run_benchmark 1 "client_ivc_flow wasm $IVC_BENCH"
else
  for runtime in native wasm; do
    parallel -v --line-buffer --tag --jobs "$jobs" run_benchmark {#} '"client_ivc_flow '$runtime' {}"' ::: $(ls "$input_folder")
  done
fi

mkdir -p "$benchmark_output"

../scripts/combine_benchmarks.py \
  ./bench-out/*/benchmarks.json \
  > $benchmark_output/ivc-bench.json
