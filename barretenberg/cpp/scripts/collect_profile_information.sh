#!/bin/bash
set -eu

PRESET=${1:-xray-1thread} # can also be 'xray'

# Move above script dir.
cd $(dirname $0)/..

# # Configure and build with xray preset.
# cmake --preset $PRESET
# cmake --build --preset $PRESET

cd build-$PRESET

# # Clear old profile data.
# rm -f xray-log.honk_bench_main_simple.*

# # Run benchmark with profiling.
# XRAY_OPTIONS="patch_premain=true xray_mode=xray-basic verbosity=1" ./bin/honk_bench_main_simple

# Process benchmark file.
llvm-xray-16 stack xray-log.honk_bench_main_simple.* \
  --instr_map=./bin/honk_bench_main_simple --stack-format=flame --aggregation-type=time --all-stacks \
   | ../scripts/flamegraph.pl > xray.svg
echo "Profiling complete, now you can do e.g. 'scp mainframe:`readlink -f xray.svg` .' and open the SVG in a browser."
  #  | ../scripts/corrector_of_llvm_xray_stack_flame/target/debug/corrector-of-llvm-xray-stack-flame \
