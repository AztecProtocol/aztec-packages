#!/bin/bash
set -eu

# can also be 'xray-1thread'
PRESET=${1:-clang16}

# Move above script dir.
cd $(dirname $0)/..

# Configure and build with xray preset.
cmake --preset $PRESET
cmake --build --preset $PRESET

cd build-$PRESET

./bin/standard_plonk_bench | tee standard_plonk_bench.out
./bin/ultra_honk_rounds_bench | tee ultra_honk_rounds_bench.out
./bin/ultra_plonk_rounds_bench | tee ultra_plonk_rounds_bench.out
./bin/ultra_honk_bench | tee ultra_honk_bench.out
./bin/ultra_plonk_bench | tee ultra_plonk_bench.out