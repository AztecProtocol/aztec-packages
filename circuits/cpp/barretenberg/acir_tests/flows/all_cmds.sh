#!/bin/sh
set -eu

NAME=$(basename $PWD)

if [ -n "$VERBOSE" ]; then
  VFLAG="-v"
fi

BFLAG="-b ./target/${NAME}.bytecode"

$BIN gates -c $CRS_PATH $VFLAG $BFLAG
$BIN prove -o proof -c $CRS_PATH $VFLAG $BFLAG
$BIN write_vk -o vk -c $CRS_PATH $VFLAG $BFLAG
$BIN verify -k vk -p proof $VFLAG