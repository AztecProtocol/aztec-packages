#!/usr/bin/env bash
# Simplified test runner for bb-prover proving tests.
# Unlike end-to-end's test_simple.sh, this is tailored for proving workloads.
set -eu

cd $(dirname $0)/..

export HARDWARE_CONCURRENCY=${CPUS:-31}
export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-1}
export TOKIO_WORKER_THREADS=${TOKIO_WORKER_THREADS:-1}
export LOG_LEVEL=${LOG_LEVEL:-verbose}
export NODE_NO_WARNINGS=1
export FORCE_COLOR=1

# Pass through test control and benchmark output vars
export RUN_AVM_OPCODE_SPAM=${RUN_AVM_OPCODE_SPAM:-}
export RUN_AVM_TOKEN_BENCH=${RUN_AVM_TOKEN_BENCH:-}
export RUN_AVM_MEGA_BULK=${RUN_AVM_MEGA_BULK:-}
export BENCH_OUTPUT=${BENCH_OUTPUT:-}
export BENCH_OUTPUT_MD=${BENCH_OUTPUT_MD:-}

# Pass through SEED for reproducible random value generation
export SEED=${SEED:-}

test_file=$1
shift

node --experimental-vm-modules ../node_modules/.bin/jest \
  --testTimeout=${TEST_TIMEOUT:-600000} \
  --forceExit \
  --no-cache \
  --runInBand \
  "$test_file" "$@"
