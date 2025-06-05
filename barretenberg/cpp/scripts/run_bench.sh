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

mkdir -p bench-out/$(dirname $name)

export MEMUSAGE_OUT="bench-out/$name-peak-memory-mb.txt"

case $arch in
  native)
    memusage $bin --benchmark_out=./bench-out/$name.json --benchmark_filter=$filter
    ;;
  wasm)
    memusage ./scripts/wasmtime.sh $bin --benchmark_out=./bench-out/$name.json --benchmark_filter=$filter
    ;;
esac

# Read the benchmark json, making it smaller-is-better format and adding memory usage stats
jq --arg name_time "$name/seconds" --arg name_mem "$name/memory" --arg value_mem "$(cat "$MEMUSAGE_OUT")" '[
  {name: $name_time, value: .benchmarks[0].real_time, unit: .benchmarks[0].time_unit},
  {name: $name_mem, value: $value_mem, unit: "MB"}
]' ./bench-out/$name.json > ./bench-out/$name.bench.json
