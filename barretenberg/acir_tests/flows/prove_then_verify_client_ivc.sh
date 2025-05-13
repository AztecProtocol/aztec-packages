#!/usr/bin/env bash
# Create intermediate state in a directory. Uses a temp dir to ensure parallel safe and cleans up on exit.
# TODO this is unused
set -eux

CRS_PATH=${CRS_PATH:-$HOME/.bb-crs}
BIN=$(realpath ${BIN:-../cpp/build/bin/bb})

[ -n "${1:-}" ] && cd ./acir_tests/$1

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT

flags="--scheme client_ivc -c $CRS_PATH ${VERBOSE:+-v}"

parallel ::: \
  "$BIN prove $flags -i target/ivc-inputs.msgpack $INFLAG --output_format proof -o $outdir" \
  "$BIN write_vk $flags -i target/ivc-inputs.msgpack $INFLAG --verifier_type ivc -o $outdir"
$BIN verify $flags -p $outdir/proof -k $outdir/vk
