#!/usr/bin/env bash
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

# enter script folder
cd "$(dirname $0)"
cd ../../srs_db
./download_ignition.sh 1
./download_grumpkin.sh
cd ../build
time ./bin/ultra_honk_rounds_bench --benchmark_format=json > ultra_honk_rounds_bench.json
echo "Testing if we have created valid JSON:"
cat ultra_honk_rounds_bench.json | tee /dev/tty | jq empty