#!/bin/bash
# This runs an individual test from the src folder.
# It's the script used by ./bootstrap.sh test-cmds.
# Provides a concise, easy to read, easy to run command for reproducing a test run.
set -eu

cd $(dirname $0)/..

export NODE_OPTIONS="--no-warnings --experimental-vm-modules --loader ts-node/esm"
./node_modules/.bin/jest $1