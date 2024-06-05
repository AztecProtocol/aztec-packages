#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}

$BIN client_ivc_prove_output_all $VFLAG -c $CRS_PATH -b ./target/program.json
