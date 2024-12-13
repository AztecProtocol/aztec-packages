#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG"

$BIN prove --scheme client_ivc --input_type compiletime_stack $VFLAG -c $CRS_PATH -b ./target/program.json
$BIN prove_tube -k vk -p proof $FLAGS
