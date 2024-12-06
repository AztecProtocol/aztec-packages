#!/bin/bash
set -eu

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG"
[ "${RECURSIVE}" = "true" ] && FLAGS+=" --recursive"
[ -n "${SYS:-}" ] && SYS="_$SYS" || SYS=""

# Test we can perform the proof/verify flow.
# This ensures we test independent pk construction through real/garbage witness data paths.
$BIN verify$SYS $FLAGS \
    -k <($BIN write_vk$SYS -o - $FLAGS $BFLAG) \
    -p <($BIN prove$SYS -o - $FLAGS $BFLAG)
