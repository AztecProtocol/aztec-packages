#!/usr/bin/env bash
# This runs an individual bench.
# It's the script used by ./bootstrap.sh bench_cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
set -eu

cd $(dirname $0)/..

arch=$1
name=$2
bin=$3
filter=$4

export GTEST_COLOR=1
export HARDWARE_CONCURRENCY=${CPUS:-8}
export IGNITION_CRS_PATH=./srs_db/ignition
export GRUMPKIN_CRS_PATH=./srs_db/grumpkin

mkdir -p bench-out

case $arch in
  native)
    $bin --benchmark_out=./bench-out/$name.json --benchmark_filter=$filter
    ;;
  wasm)
    ./scripts/wasmtime.sh $bin --benchmark_out=./bench-out/$name.json --benchmark_filter=$filter
    ;;
esac
