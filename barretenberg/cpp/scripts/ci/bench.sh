#!/usr/bin/env sh
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

# enter script folder
cd "$(dirname $0)"
cd ../../srs_db
./download_ignition.sh 1
./download_grumpkin.sh
cd ../build
./bin/ultra_honk_bench --benchmark_format=json | tee ultra_honk_bench.json
./bin/goblin_ultra_honk_bench --benchmark_format=json | tee goblin_ultra_honk_bench.json
./bin/ivc_bench --benchmark_format=json | tee ivc_bench.json
echo "Testing if we have created valid JSON."
cat ultra_honk_bench.json | jq empty
cat goblin_ultra_honk_bench.json | jq empty
cat ivc_bench.json | jq empty
echo "JSON is valid. Continuing."