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
[ -n "${NAME_POSTFIX:-}" ] && name+=_$NAME_POSTFIX

export NODE_OPTIONS="--no-warnings --experimental-vm-modules --loader @swc-node/register"
cd ../$dir

if [ "${ISOLATE:-0}" -eq 1 ]; then
  export ENV_VARS_TO_INJECT="NODE_OPTIONS LOG_LEVEL FAKE_PROOFS"
  NAME=$name exec docker_isolate "node ../node_modules/.bin/jest --forceExit --runInBand $test $@"
else
  exec node ../node_modules/.bin/jest --forceExit --runInBand $test $@
  # trap 'kill -9 -$sid &>/dev/null || true' EXIT
  # setsid node ../node_modules/.bin/jest --forceExit --runInBand $test $@ &
  # child_pid=$!
  # sid=$(ps -o sid= -p $child_pid | tr -d ' ')
  # wait $child_pid
fi
