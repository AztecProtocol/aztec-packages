#!/usr/bin/env bash
# This runs an individual test.
# It's the script used by ./bootstrap.sh test_cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
set -eu

export native_preset=${NATIVE_PRESET:-clang16-assert}

cd $(dirname $0)/..
# Enter build directory. We resolve this in case native_preset is non-standard e.g. clang16-coverage
cd $(scripts/cmake/preset-build-dir $native_preset)

export GTEST_COLOR=1
export HARDWARE_CONCURRENCY=${CPUS:-8}

exec ./bin/$1 --gtest_filter=$2
