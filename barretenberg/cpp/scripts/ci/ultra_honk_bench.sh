#!/bin/bash
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

# enter script folder
cd "$(dirname $0)"
cd ../../srs_db
./download_ignition.sh 1
./download_grumpkin.sh
cd ../build
time ./bin/ultra_honk_rounds_bench