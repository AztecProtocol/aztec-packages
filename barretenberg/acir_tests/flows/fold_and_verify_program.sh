#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}

$BIN prove_and_verify --scheme client_ivc --input_type compiletime-stack $VFLAG -c $CRS_PATH -b ./target/program.json
