#!/usr/bin/env bash
set -eu

BENCHMARK=${1:-commit_bench}

# Move above script dir.
cd $(dirname $0)/..

# Configure and build.
cmake --preset clang16
cmake --build --preset clang16 --target $BENCHMARK

cd build
scp $BB_SSH_KEY ./bin/commit_bench $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build
ssh $BB_SSH_KEY $BB_SSH_INSTANCE \
  "cd $BB_SSH_CPP_PATH/build ; ./bin/commit_bench"
