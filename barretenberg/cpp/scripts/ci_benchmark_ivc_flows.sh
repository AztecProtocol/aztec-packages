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
  local flow_folder="$2"
  local flow="$(basename $flow_folder)"
  local start=$(date +%s%N)

  local name_path="app-proving/$flow/$runtime"
  local output="bench-out/$name_path"
  rm -rf "$output"
  mkdir -p "$output"
  export MEMUSAGE_OUT="$output/peak-memory-mb.txt"

  run_bb_cli_bench "$runtime" "$output" "prove -o $output --ivc_inputs_path $flow_folder/ivc-inputs.msgpack --scheme client_ivc -v"

  if [[ "${NATIVE_PRESET:-}" == op-count-time && "$runtime" != wasm ]]; then
    python3 scripts/analyze_client_ivc_bench.py --prefix . --json $output/op-counts.json --benchmark ""
  fi

  local end=$(date +%s%N)
  local elapsed_ns=$(( end - start ))
  local elapsed_ms=$(( elapsed_ns / 1000000 ))
  local memory_taken_mb=$(cat "$MEMUSAGE_OUT")

  echo "$flow ($runtime) has proven in $((elapsed_ms / 1000))s and peak memory of ${memory_taken_mb}MB."
  dump_fail "verify_ivc_flow $flow $output/proof"
  echo "$flow ($runtime) has verified."

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
}

export -f verify_ivc_flow run_bb_cli_bench

client_ivc_flow $1 $2
