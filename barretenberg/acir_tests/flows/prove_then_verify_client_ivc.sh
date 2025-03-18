#!/bin/bash
# Create intermediate state in a directory. Uses a temp dir to ensure parallel safe and cleans up on exit.
set -eux

INFLAG=${INPUT_TYPE:---input_type runtime_stack}

if [ "$INFLAG" = "--input_type runtime_stack" ]; then
  BFLAG=target/acir.msgpack
  WFLAG=target/witness.msgpack
else
  BFLAG=target/program.json
  WFLAG=target/witness.gz
fi

CRS_PATH=${CRS_PATH:-$HOME/.bb-crs}
BIN=$(realpath ${BIN:-../cpp/build/bin/bb})

[ -n "${1:-}" ] && cd ./acir_tests/$1

outdir=$(mktemp -d)
trap "rm -rf $outdir" EXIT

flags="--scheme client_ivc -c $CRS_PATH ${VERBOSE:+-v}"

parallel ::: \
  "$BIN prove $flags -b $BFLAG -w $WFLAG $INFLAG --output_format proof -o $outdir" \
  "$BIN write_vk $flags -b $BFLAG $INFLAG --verifier_type ivc -o $outdir"
$BIN verify $flags -p $outdir/proof -k $outdir/vk
