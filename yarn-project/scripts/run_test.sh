#!/usr/bin/env bash
# This runs an individual test from the dest folder.
# It's the script used by ./bootstrap.sh test_cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
# TODO: --forceExit *should not be needed*. Find out what's not being cleaned up.
source $(git rev-parse --show-toplevel)/ci3/source

test=$1
shift 1
dir=${test%%/*}
name=$test

cd ../$dir

export LOG_LEVEL=${LOG_LEVEL:-info}
exec node --no-warnings --experimental-vm-modules --loader @swc-node/register \
  ../node_modules/.bin/jest --forceExit --runInBand $test "$@"
