#!/bin/bash
set -eu

# Move above script dir.
cd $(dirname $0)/..

# Configure and build with xray preset.
cmake --preset xray
cmake --build --preset xray

cd build-xray

# Clear old benchmarks.
rm -f xray-log.ultra_honk_bench.*

# Run ultra-honk with benchmarking.
XRAY_OPTIONS="patch_premain=true xray_mode=xray-basic verbosity=1" ./bin/ultra_honk_bench --benchmark_min_time=10

# Process benchmark file.
llvm-xray-16 stack xray-log.ultra_honk_bench.* \
  --instr_map=./bin/ultra_plonk_bench --stack-format=flame --aggregation-type=time --all-stacks \
   | ../scripts/corrector_of_llvm_xray_stack_flame/target/debug/corrector-of-llvm-xray-stack-flame \
   | ../scripts/flamegraph.pl > xray.svg
