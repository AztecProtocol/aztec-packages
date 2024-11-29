#!/bin/sh
set -eux

mkdir -p ./proofs

VFLAG=${VERBOSE:+-v}

$BIN prove --scheme client_ivc --input_type compiletime-stack $VFLAG -c $CRS_PATH -b ./target/program.json
$BIN prove_tube  --scheme "" -k vk -p proof -c $CRS_PATH $VFLAG # WORKTODO: no default scheme for now
$BIN verify_tube --scheme "" -k vk -p proof -c $CRS_PATH $VFLAG

