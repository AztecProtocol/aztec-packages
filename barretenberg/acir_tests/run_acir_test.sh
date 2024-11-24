#!/usr/bin/env bash
set -eu

TEST_NAME=$1

cd $(dirname $0)

COMPILE=${COMPILE:-0}
BIN=$(realpath ${BIN:-../cpp/build/bin/bb})
CRS_PATH=${CRS_PATH:-$HOME/.bb-crs}
FLOW=${FLOW:-prove_and_verify}
RECURSIVE=${RECURSIVE:-false}
# We get little performance benefit over 16 cores (in fact it can be worse).
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}

FLOW_SCRIPT=$(realpath ./flows/${FLOW}.sh)

export BIN CRS_PATH RECURSIVE HARDWARE_CONCURRENCY VERBOSE

echo -n "Testing $TEST_NAME... "

cd ../../noir/noir-repo/test_programs/execution_success/$TEST_NAME

if [ "$COMPILE" -eq 1 ]; then
  echo -n "compiling... "
  export RAYON_NUM_THREADS=4
  rm -rf target
  nargo=../../../target/release/nargo
  compile_output=$($nargo compile --silence-warnings 2>&1 && $nargo execute 2>&1)
  mv ./target/$TEST_NAME.json ./target/program.json
  mv ./target/$TEST_NAME.gz ./target/witness.gz
  if [ "$COMPILE_ONLY" -eq 1 ]; then
    echo "done."
    exit 0
  fi
fi

if [[ ! -f ./target/program.json || ! -f ./target/witness.gz ]]; then
  echo -e "\033[33mSKIPPED\033[0m (uncompiled)"
  exit 0
fi

set +e
start=$SECONDS
output=$($FLOW_SCRIPT 2>&1)
result=$?
end=$SECONDS
duration=$((end - start))
set -e

[ "${VERBOSE:-0}" -eq 1 ] && echo -e "\n${compile_output:-}\n$output"

if [ $result -eq 0 ]; then
  echo -e "\033[32mPASSED\033[0m (${duration}s)"
else
  echo -e "\033[31mFAILED\033[0m"
  echo "$output"
  exit 1
fi