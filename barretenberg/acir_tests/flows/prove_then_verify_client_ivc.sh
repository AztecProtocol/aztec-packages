#!/bin/bash
# Create intermediate state in a directory. Uses a temp dir to ensure parallel safe and cleans up on exit.
set -eux

INFLAG=${INPUT_TYPE:---input_type single_circuit}

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

# Trying to use process substitution fails with command substitution: ignored null byte in input.
#   So we want to avoid capturing via shell strings.
# Trying to use -o - > <named pipe> fails with a segfault
# Trying to use -o <named pipe> fails because the output type is a directory where a file `proof`
#   and/or `vk` will be written, not a file path where proof/vk will be written
$BIN prove $flags -b $BFLAG -w $WFLAG $INFLAG --output_content proof -o $outdir&
$BIN write_vk $flags -b $BFLAG $INFLAG -o $outdir &
wait
$BIN verify $flags -p $outdir/proof -k $outdir/vk
