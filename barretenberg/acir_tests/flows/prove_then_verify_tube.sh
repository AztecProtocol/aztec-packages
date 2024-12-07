#!/bin/sh
set -eux

mkdir -p ./proofs

CRS_PATH=${CRS_PATH:-$PWD/crs}
BIN=$(realpath ${BIN:-../cpp/build/bin/bb})
VFLAG=${VERBOSE:+-v}

[ -n "$1" ] && cd ./acir_tests/$1

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT

$BIN prove --scheme client_ivc --input_type compiletime_stack $VFLAG -c $CRS_PATH -b ./target/program.json -o $outdir
$BIN prove_tube -c $CRS_PATH $VFLAG -o $outdir
$BIN verify_tube -c $CRS_PATH $VFLAG -o $outdir
