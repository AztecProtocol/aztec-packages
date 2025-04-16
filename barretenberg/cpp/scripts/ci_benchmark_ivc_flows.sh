#!/usr/bin/env bash
# Performs the client ivc private transaction proving benchmarks for our 'realistic apps'.
# This is called by yarn-project/end-to-end/bootstrap.sh bench, which creates these inputs from end-to-end tests.
source $(git rev-parse --show-toplevel)/ci3/source

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <bench_input_folder> <output_folder>"
  exit 1
fi
export input_folder="$1"
output_folder="$2"

cd ..

echo_header "bb ivc flow bench"

export HARDWARE_CONCURRENCY=16
export IGNITION_CRS_PATH=./srs_db/ignition
export GRUMPKIN_CRS_PATH=./srs_db/grumpkin

rm -rf bench-out/ivc && mkdir -p bench-out/ivc

function verify_ivc_flow {
  local flow="$1"
  local proof="$2"
  # Check that this verifies with one of our verification keys and fails with the other.
  # NOTE: This is effectively a test.
  # TODO(AD): Checking which one would be good, but there isn't too much that can go wrong here.
  set +e
  echo_stderr "Private verify."
  ./build/bin/bb verify --scheme client_ivc -p "$proof" -k ../../yarn-project/bb-prover/artifacts/private-civc-vk 1>&2
  local private_result=$?
  echo_stderr "Private verify: $private_result."
  ./build/bin/bb verify --scheme client_ivc -p "$proof" -k ../../yarn-project/bb-prover/artifacts/public-civc-vk 1>&2
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

function client_ivc_flow_native {
  set -eu
  local flow=$1
  local flow_folder="$input_folder/$flow"
  local start=$(date +%s%N)
  mkdir -p "bench-out/$flow-proof-files"
  export MEMUSAGE_OUT="bench-out/$flow-proof-files/peak-memory-native-mb.txt"

  function bb_cli_bench_native {
    export MAIN_ARGS="$*"
    memusage ./build/bin/bb_cli_bench \
        --benchmark_out=bench-out/$flow-proof-files/op-counts.json \
        --benchmark_out_format=json || {
      echo "bb_cli_bench failed with args: $*"
      exit 1
    }
  }

  bb_cli_bench_native prove -o "bench-out/$flow-proof-files" -b "$flow_folder/acir.msgpack" -w "$flow_folder/witnesses.msgpack" --scheme client_ivc --input_type runtime_stack
  local end=$(date +%s%N)
  local elapsed_ns=$(( end - start ))
  local elapsed_ms=$(( elapsed_ns / 1000000 ))
  local memory_taken_mb=$(cat "$MEMUSAGE_OUT")
  echo "$flow (native) has proven in $((elapsed_ms / 1000))s and peak memory of ${memory_taken_mb}MB."
  dump_fail "verify_ivc_flow $flow bench-out/$flow-proof-files/proof"
  echo "$flow (native) has verified."
  cat > "./bench-out/ivc/$flow-ivc-native.json" <<EOF
  {
    "benchmarks": [
    {
      "name": "$flow-ivc-proof",
      "time_unit": "ms",
      "real_time": ${elapsed_ms}
    },
    {
      "name": "$flow-ivc-proof-memory",
      "time_unit": "MB",
      "real_time": ${elapsed_ms}
    }
    ]
  }
EOF
}

function client_ivc_flow_wasm {
  set -eu
  local flow=$1
  local flow_folder="$input_folder/$flow"
  local start=$(date +%s%N)
  mkdir -p "bench-out/$flow-proof-files"
  export MEMUSAGE_OUT="bench-out/$flow-proof-files/peak-memory-wasm-mb.txt"

  function bb_cli_bench_wasm {
    export MAIN_ARGS="$*"
    export WASMTIME_ALLOWED_DIRS="--dir=$HOME/.bb-crs --dir="$flow_folder" --dir=bench-out/$flow-proof-files"
    memusage scripts/wasmtime.sh $WASMTIME_ALLOWED_DIRS ./build-wasm-threads/bin/bb_cli_bench \
        --benchmark_out=bench-out/$flow-proof-files/op-counts.json \
        --benchmark_out_format=json || {
      echo "bb_cli_bench failed with args: $*"
      exit 1
    }
  }
  bb_cli_bench_wasm prove -o "bench-out/$flow-proof-files" -b "$flow_folder/acir.msgpack" -w "$flow_folder/witnesses.msgpack" --scheme client_ivc --input_type runtime_stack
  local end=$(date +%s%N)
  local elapsed_ns=$(( end - start ))
  local elapsed_ms=$(( elapsed_ns / 1000000 ))
  local memory_taken_mb=$(cat "$MEMUSAGE_OUT")
  echo "$flow (WASM) has proven in ${elapsed_ms}ms and peak memory of ${memory_taken_mb}MB."
  dump_fail "verify_ivc_flow $flow bench-out/$flow-proof-files/proof"
  echo "$flow (WASM) has verified."
  cat > "./bench-out/ivc/$flow-ivc-wasm.json" <<EOF
  {
    "benchmarks": [
    {
      "name": "$flow-ivc-proof-wasm",
      "time_unit": "ms",
      "real_time": ${elapsed_ms}
    },
    {
      "name": "$flow-ivc-proof-wasm-memory",
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

export -f verify_ivc_flow client_ivc_flow_native client_ivc_flow_wasm run_benchmark

# TODO this does not work with smaller core counts - we will soon have a benchmark-wide mechanism for this.
num_cpus=$(get_num_cpus)
jobs=$((num_cpus / HARDWARE_CONCURRENCY))

# Split up the flows into chunks to run in parallel - otherwise we run out of CPUs to pin.
if [ -n "${IVC_BENCH:-}" ]; then
  # If IVC_BENCH is set, run only that benchmark.
  run_benchmark 1 "client_ivc_flow_native $IVC_BENCH"
  run_benchmark 1 "client_ivc_flow_wasm $IVC_BENCH"
else
  parallel -v --line-buffer --tag --jobs "$jobs" run_benchmark {#} '"client_ivc_flow_native {}"' ::: $(ls "$input_folder")
  parallel -v --line-buffer --tag --jobs "$jobs" run_benchmark {#} '"client_ivc_flow_wasm {}"' ::: $(ls "$input_folder")
fi

mkdir -p "$output_folder"

../scripts/combine_benchmarks.py \
  ./bench-out/ivc/*.json \
  > $output_folder/ivc-bench.json
