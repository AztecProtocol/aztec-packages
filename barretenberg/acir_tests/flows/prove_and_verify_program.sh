#!/bin/sh
# prove_and_verify produces no output, so is parallel safe.
set -eu

VFLAG=${VERBOSE:+-v}
FLAGS="-c $CRS_PATH $VFLAG"
if [ "${RECURSIVE:-}" = "true" ]; then
  FLAGS="$FLAGS --recursive"
fi

$BIN prove_and_verify_${SYS}_program $FLAGS -b ./target/program.json
