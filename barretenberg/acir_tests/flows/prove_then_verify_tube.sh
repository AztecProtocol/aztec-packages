#!/bin/sh
set -eux

mkdir -p ./proofs

CRS_PATH=${CRS_PATH:-$PWD/crs}
BIN=$(realpath ${BIN:-../cpp/build/bin/bb})

[ -n "$1" ] && cd ./acir_tests/$1

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT

flags="-c $CRS_PATH ${VERBOSE:+-v} -o $outdir"

$BIN prove --scheme client_ivc --input_type compiletime_stack $flags -b ./target/program.json
$BIN prove_tube $flags
$BIN verify_tube $flags
