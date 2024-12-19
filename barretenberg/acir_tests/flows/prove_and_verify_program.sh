#!/bin/sh
# prove_and_verify produces no output, so is parallel safe.
set -eu

VFLAG=${VERBOSE:+-v}
FLAGS="-c $CRS_PATH $VFLAG"
[ "${RECURSIVE}" = "true" ] && FLAGS+=" --recursive"

$BIN prove_and_verify_${SYS}_program $FLAGS -b ./target/program.json
