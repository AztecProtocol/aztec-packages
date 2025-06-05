#!/usr/bin/env bash
# This runs an individual test.
# It's the script used by ./bootstrap.sh test_cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
set -eu

export native_preset=${NATIVE_PRESET:-clang16-assert}

cd $(dirname $0)/..
# E.g. build, build-debug or build-coverage
cd $(scripts/native-preset-build-dir)

export GTEST_COLOR=1
export HARDWARE_CONCURRENCY=${CPUS:-8}

exec ./bin/$1 --gtest_filter=$2
