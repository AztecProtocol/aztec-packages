#!/usr/bin/env bash

set -e

# run commands relative to parent directory
cd $(dirname $0)/..

TEST=${1:-*}
PRESET=${PRESET:-clang16}

cmake --build --preset $PRESET --target world_state_tests
./build/bin/world_state_tests --gtest_filter=WorldStateTest.${TEST}
