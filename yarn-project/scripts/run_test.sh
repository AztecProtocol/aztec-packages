#!/bin/bash
# This runs an individual test from the dest folder.
# It's the script used by ./bootstrap.sh test-cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
set -eu

dir=${1%%/*}
test=${1#*dest/}

export NODE_OPTIONS="--no-warnings --experimental-vm-modules"

cd $(dirname $0)/../$dir

# TODO: --forceExit *should not be needed*. Find out what's not being cleaned up.
node ../node_modules/.bin/jest --forceExit --runInBand --testRegex '\.test\.js$' --rootDir dest $test