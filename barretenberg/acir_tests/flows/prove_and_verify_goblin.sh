#!/bin/sh
set -u

VFLAG=${VERBOSE:+-v}

$BIN prove_and_verify_goblin $VFLAG -c $CRS_PATH -b ./target/acir.gz
echo $?