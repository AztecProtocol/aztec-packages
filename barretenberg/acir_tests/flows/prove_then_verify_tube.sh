#!/bin/sh
set -eux

mkdir -p ./proofs

CRS_PATH=${CRS_PATH:-$HOME/.bb-crs}
BIN=$(realpath ${BIN:-../cpp/build/bin/bb})

[ -n "${1:-}" ] && cd ./acir_tests/$1

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT

flags="-c $CRS_PATH ${VERBOSE:+-v} -o $outdir"

# TODO(https://github.com/AztecProtocol/barretenberg/issues/1252): deprecate in favor of normal proving flow
$BIN OLD_API write_arbitrary_valid_client_ivc_proof_and_vk_to_file $flags
$BIN prove_tube $flags
$BIN verify_tube $flags
