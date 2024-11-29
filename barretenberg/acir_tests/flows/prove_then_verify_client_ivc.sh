#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="--scheme client_ivc -c $CRS_PATH $VFLAG --input_type compiletime-stack  --output_type fields-msgpack"

$BIN prove $FLAGS $BFLAG
$BIN verify $FLAGS
