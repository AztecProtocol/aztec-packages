#!/bin/bash
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

# enter script folder
cd "$(dirname $0)"
cd ../srs_db
./download_ignition.sh 1
cd ../build
./bin/grumpkin_srs_gen 1048576
./bin/ultra_honk_bench