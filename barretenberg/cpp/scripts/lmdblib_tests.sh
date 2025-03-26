#!/usr/bin/env bash

set -e

# run commands relative to parent directory
cd $(dirname $0)/..

DEFAULT_TESTS=LMDBStoreTest.*:LMDBEnvironmentTest.*
TEST=${1:-$DEFAULT_TESTS}
PRESET=${PRESET:-clang16}

cmake --build --preset $PRESET --target lmdblib_tests
./build/bin/lmdblib_tests --gtest_filter=$TEST
