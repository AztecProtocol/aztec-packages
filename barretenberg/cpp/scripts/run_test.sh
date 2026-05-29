#!/usr/bin/env bash
# This runs an individual test.
# It's the script used by ./bootstrap.sh test_cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
set -eu

export native_preset=${NATIVE_PRESET:-clang20}
test_bin=${1:?test binary required}
test_filter=${2:?gtest filter required}

cd $(dirname $0)/..

if [[ "$test_bin" == "bbapi_tests" && "$test_filter" == "ChonkPinnedIvcInputsTest.AllPinnedFlows" ]]; then
  scripts/chonk_inputs.sh download
fi

# E.g. build, build-debug or build-coverage
cd $(scripts/preset-build-dir)

export GTEST_COLOR=1
export HARDWARE_CONCURRENCY=${CPUS:-8}
export BB_VERBOSE=1

exec ./bin/$test_bin --gtest_filter=$test_filter
