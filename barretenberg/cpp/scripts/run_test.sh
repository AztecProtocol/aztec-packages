#!/bin/bash
# This runs an individual test.
# It's the script used by ./bootstrap.sh test-cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
set -eu

cd $(dirname $0)/../build

export GTEST_COLOR=1
export HARDWARE_CONCURRENCY=8
# export IGNITION_CRS_PATH="./barretenberg/cpp/srs_db/ignition"
# export GRUMPKIN_CRS_PATH="./barretenberg/cpp/srs_db/grumpkin"

./bin/$1 --gtest_filter=$2