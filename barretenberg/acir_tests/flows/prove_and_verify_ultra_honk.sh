#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}
FLAGS="-c $CRS_PATH $VFLAG"
if [ "${RECURSIVE}" = "true" ]; then
    FLAGS="$FLAGS --recursive"
fi

$BIN prove_and_verify_ultra_honk $FLAGS -b ./target/program.json
