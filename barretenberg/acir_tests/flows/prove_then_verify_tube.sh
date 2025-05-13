#!/bin/sh
set -eux

mkdir -p ./proofs

CRS_PATH=${CRS_PATH:-$HOME/.bb-crs}
BIN=$(realpath ${BIN:-../cpp/build/bin/bb})

[ -n "${1:-}" ] && cd ./acir_tests/$1

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT

# TODO(https://github.com/AztecProtocol/barretenberg/issues/1252): deprecate in favor of normal proving flow
$BIN OLD_API write_arbitrary_valid_client_ivc_proof_and_vk_to_file -c $CRS_PATH ${VERBOSE:+-v} -o $outdir
$BIN prove_tube -c $CRS_PATH ${VERBOSE:+-v} -k $outdir/vk -o $outdir
# TODO(https://github.com/AztecProtocol/barretenberg/issues/1322): Just call verify.
$BIN verify_tube -c $CRS_PATH ${VERBOSE:+-v} -o $outdir
