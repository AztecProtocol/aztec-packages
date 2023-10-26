#!/bin/bash
set -eu

# Move above script dir.
cd $(dirname $0)/..

# Configure and build with xray preset.
cmake --preset clang16
cmake --build --preset clang16

cd build

echo "<details><summary>Standard Plonk</summary>"
./bin/standard_plonk_bench | tee standard_plonk_bench.out
echo "</details/>"
echo "<details><summary>Ultra Honk</summary>"
./bin/ultra_honk_rounds_bench | tee ultra_honk_rounds_bench.out
echo "</details/>"
echo "<details><summary>Ultra Plonk</summary>"
./bin/ultra_plonk_rounds_bench | tee ultra_plonk_rounds_bench.out
echo "</details/>"
echo "<details><summary>Ultra Honk</summary>"
./bin/ultra_honk_bench | tee ultra_honk_bench.out
echo "</details/>"
echo "<details><summary>Ultra Plonk</summary>"
./bin/ultra_plonk_bench | tee ultra_plonk_bench.out
echo "</details/>"
