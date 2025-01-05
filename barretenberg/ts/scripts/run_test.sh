#!/bin/bash
# This runs an individual test from the dest folder.
# Due to using web-workers, trying to do on-the-fly ts transpilation was having issues.
# It's the script used by ./bootstrap.sh test-cmds.
# It means we can return a concise, easy to read, easy to run command for reproducing a test run.
set -eu

cd $(dirname $0)/..

export NODE_OPTIONS="--no-warnings --experimental-vm-modules"

./node_modules/.bin/jest --testRegex '\.test\.js$' --rootDir ./dest/node --runInBand $1