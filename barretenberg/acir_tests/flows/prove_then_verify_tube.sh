#!/bin/sh
set -eux

mkdir -p ./proofs

VFLAG=${VERBOSE:+-v}

$BIN prove --scheme client_ivc --input_type compiletime_stack $VFLAG -c $CRS_PATH -b ./target/program.json
$BIN prove_tube -k vk -p proof -c $CRS_PATH $VFLAG
$BIN verify_tube -k vk -p proof -c $CRS_PATH $VFLAG

