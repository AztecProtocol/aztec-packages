#!/bin/sh
set -eux

mkdir -p ./proofs

VFLAG=${VERBOSE:+-v}

$BIN write_arbitrary_valid_proof_and_vk_to_file --scheme client_ivc $VFLAG -c $CRS_PATH
$BIN prove_tube -k vk -p proof -c $CRS_PATH $VFLAG
$BIN verify_tube -k vk -p proof -c $CRS_PATH $VFLAG

