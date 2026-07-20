#!/usr/bin/env bash
# This runs an individual test from the dest folder.
# It's the script used by ./bootstrap.sh test_cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
source $(git rev-parse --show-toplevel)/ci3/source

test=$1
shift 1
dir=${test%%/src/*}
name=$test

cd ../$dir

export RAYON_NUM_THREADS=1
export TOKIO_WORKER_THREADS=1
export UV_THREADPOOL_SIZE=${UV_THREADPOOL_SIZE:-8}
export HARDWARE_CONCURRENCY=${CPUS:-16}
export LOG_LEVEL=${LOG_LEVEL:-info}
exec node --no-warnings --experimental-vm-modules --loader @swc-node/register \
  $(git rev-parse --show-toplevel)/yarn-project/node_modules/.bin/jest --runInBand $test "$@"
