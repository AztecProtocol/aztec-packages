#!/bin/sh
set -eu

# this flow is deprecated. currently it is bb.js only. for bb is is replaced by:
# prove_and_verify --scheme client_ivc --input-type compiletime_stack
VFLAG=${VERBOSE:+-v}

$BIN fold_and_verify_program $VFLAG -c $CRS_PATH -b ./target/program.json
