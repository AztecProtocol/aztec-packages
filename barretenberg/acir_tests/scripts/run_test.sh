#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd ..

TEST_NAME=$1

COMPILE=${COMPILE:-0}
native_build_dir=$(../cpp/scripts/native-preset-build-dir)
export BIN=$(realpath ${BIN:-../cpp/$native_build_dir/bin/bb})
export CRS_PATH=${CRS_PATH:-$HOME/.bb-crs}
FLOW=${FLOW:-prove_and_verify}
export RECURSIVE=${RECURSIVE:-false}
export HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-8}
RAYON_NUM_THREADS=${RAYON_NUM_THREADS:-8}
export VERBOSE=${VERBOSE:-0}

flow_script=$(realpath ./flows/${FLOW}.sh)
nargo=$(realpath ../../noir/noir-repo/target/release/nargo)


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

if [[ ( ! -f ./target/program.json && ! -f ./target/acir.msgpack ) || \
       ( ! -f ./target/witness.gz   && ! -f ./target/witness.msgpack ) ]]; then
  echo -e "\033[33mSKIPPED\033[0m (uncompiled)"
  exit 0;
fi

set +e
SECONDS=0
if [ "$VERBOSE" -eq 1 ]; then
  output=$($flow_script 2>&1 | tee /dev/stderr)
else
  output=$($flow_script 2>&1)
fi
result=$?
duration=$SECONDS
set -e

if [ $result -eq 0 ]; then
  echo -e "${green}PASSED${reset} (${duration}s)"
else
  [ "$VERBOSE" -eq 0 ] && echo "$output"
  echo -e "${red}FAILED${reset} (${duration}s)"
  exit 1
fi
