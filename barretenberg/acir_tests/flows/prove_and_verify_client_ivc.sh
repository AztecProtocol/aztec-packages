#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}
INFLAG=${INPUT_TYPE=compiletime_stack}

FLAGS="$CRS_PATH -b ./target/program.json $VFLAG --scheme client_ivc -c --input_type $INFLAG"

$BIN prove_and_verify $FLAGS
