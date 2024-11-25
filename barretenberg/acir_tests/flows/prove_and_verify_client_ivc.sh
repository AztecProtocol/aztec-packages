#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-s client_ivc -c $CRS_PATH $VFLAG"

$BIN prove_and_verify -- $FLAGS $BFLAG
