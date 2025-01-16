#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

TEST_NAME=$1

COMPILE=${COMPILE:-1}
BIN=$(realpath ${BIN:-../cpp/build/bin/bb})
CRS_PATH=${CRS_PATH:-$HOME/.bb-crs}
FLOW=${FLOW:-prove_and_verify}
RECURSIVE=${RECURSIVE:-false}
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-8}
RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-8}
VERBOSE=${VERBOSE:-1}

flow_script=$(realpath ./flows/${FLOW}.sh)
nargo=$(realpath ../../noir/noir-repo/target/release/nargo)

export BIN CRS_PATH RECURSIVE HARDWARE_CONCURRENCY VERBOSE

cd ./acir_tests/$TEST_NAME

if [ "$COMPILE" -ne 0 ]; then
  echo -n "$TEST_NAME compiling... "
  export RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-4}
  rm -rf target
  set +e
  compile_output=$($nargo compile --silence-warnings 2>&1 && $nargo execute 2>&1)
  result=$?
  set -e
  if [ "$result" -ne 0 ]; then
    echo "failed."
    echo "$compile_output"
    exit $result
  fi
  mv ./target/$TEST_NAME.json ./target/program.json
  mv ./target/$TEST_NAME.gz ./target/witness.gz
  if [ "$COMPILE" -eq 2 ]; then
    echo "done."
    exit 0
  fi
fi

if [[ ! -f ./target/program.json || ! -f ./target/witness.gz ]]; then
  echo -e "${yellow}SKIPPED${reset} (uncompiled)"
  exit 0
fi

set +e
SECONDS=0
output=$($flow_script 2>&1 | add_timestamps)
result=$?
duration=$SECONDS
set -e

if [ $result -eq 0 ]; then
  echo -e "${green}PASSED${reset} (${duration}s)"
  if [ "$VERBOSE" -eq 1 ]; then
    echo "$output"
  fi
else
  echo -e "${red}FAILED${reset}"
  echo "$output"
  exit 1
fi