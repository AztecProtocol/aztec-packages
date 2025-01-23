#!/bin/bash
# Create intermediate state in a directory. Uses a temp dir to ensure parallel safe and cleansup on exit.
set -eu

CRS_PATH=${CRS_PATH:-$HOME/.bb-crs}
BIN=$(realpath ${BIN:-../cpp/build/bin/bb})

[ -n "${1:-}" ] && cd ./acir_tests/$1

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT

flags="--scheme client_ivc -c $CRS_PATH ${VERBOSE:+-v} -o $outdir"

$BIN prove $flags -b ./target/program.json --input_type ${INPUT_TYPE:-compiletime_stack}
$BIN verify $flags
