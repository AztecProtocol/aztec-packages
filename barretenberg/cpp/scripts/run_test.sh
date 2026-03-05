#!/usr/bin/env bash
# This runs an individual test.
# It's the script used by ./bootstrap.sh test_cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
set -eu

export native_preset=${NATIVE_PRESET:-clang20}

cd $(dirname $0)/..
# TODO: Remove once AMI has been updated with compressed CRS
# Ensure compressed CRS is available (AMI may only have uncompressed)
../crs/bootstrap.sh
# E.g. build, build-debug or build-coverage
cd $(scripts/preset-build-dir)

export GTEST_COLOR=1
export HARDWARE_CONCURRENCY=${CPUS:-8}
export BB_VERBOSE=1

exec ./bin/$1 --gtest_filter=$2
