#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}
FLAGS="-c $CRS_PATH $VFLAG"
if [ "${RECURSIVE}" = "true" ]; then
    FLAGS="$FLAGS --recursive"
fi

# This is the fastest flow, because it only generates pk/vk once, gate count once, etc.
# It may not catch all class of bugs.
$BIN prove_and_verify $FLAGS -b ./target/program.json
