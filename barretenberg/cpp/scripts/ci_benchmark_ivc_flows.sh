#!/usr/bin/env bash
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

function client_ivc_flow {
  set -eu
  local flow=$1
  local flow_folder="$input_folder/$flow"
  local start=$(date +%s%N)
  mkdir -p "bench-out/$flow-proof-files"
  function bb_cli_bench {
    MAIN_ARGS="$*" build-op-count-time/bin/bb_cli_bench --benchmark_out=bench-out/$flow-proof-files/op-counts.json --benchmark_out_format=json || {
      echo "bb_cli_bench failed with args: $*"
      exit 1
    }
  }
  bb_cli_bench prove -o "bench-out/$flow-proof-files" -b "$flow_folder/acir.msgpack" -w "$flow_folder/witnesses.msgpack" --scheme client_ivc --input_type runtime_stack
  echo "$flow has proven."
  local end=$(date +%s%N)
  dump_fail "verify_ivc_flow $flow bench-out/$flow-proof-files/proof"
  echo "$flow has verified."
  local elapsed_ns=$(( end - start ))
  local elapsed_ms=$(( elapsed_ns / 1000000 ))
  cat > "./bench-out/ivc/$flow-ivc.json" <<EOF
  {
    "benchmarks": [
    {
      "name": "$flow-ivc-proof",
      "time_unit": "ms",
      "real_time": ${elapsed_ms}
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

export -f verify_ivc_flow client_ivc_flow run_benchmark

# TODO this does not work with smaller core counts - we will soon have a benchmark-wide mechanism for this.
num_cpus=$(get_num_cpus)
jobs=$((num_cpus / HARDWARE_CONCURRENCY))

# Split up the flows into chunks to run in parallel - otherwise we run out of CPUs to pin.
if [ -n "${IVC_BENCH:-}" ]; then
  # If IVC_BENCH is set, run only that benchmark.
  run_benchmark 1 "client_ivc_flow $IVC_BENCH"
else
  parallel -v --line-buffer --tag --jobs "$jobs" run_benchmark {#} '"client_ivc_flow {}"' ::: $(ls "$input_folder")
fi

mkdir -p "$output_folder"

../scripts/combine_benchmarks.py \
  ./bench-out/ivc/*.json \
  > $output_folder/ivc-bench.json
