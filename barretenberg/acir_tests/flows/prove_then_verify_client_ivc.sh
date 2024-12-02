#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
INFLAG=${INPUT_TYPE=compiletime_stack}

FLAGS="--scheme client_ivc -c $CRS_PATH $VFLAG"

$BIN prove $FLAGS $BFLAG --input_type $INFLAG
$BIN verify $FLAGS
