#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}

$BIN prove_and_verify_ultra_honk_program $VFLAG -c $CRS_PATH -b ./target/program.json
