#!/bin/sh
set -eu

NAME=$(basename $PWD)

if [ -n "$VERBOSE" ]; then
  VFLAG="-v"
fi

BFLAG="-b ./target/${NAME}.bytecode"
FLAGS="-c $CRS_PATH $VFLAG"

$BIN gates $FLAGS $BFLAG
$BIN prove -o proof $FLAGS $BFLAG
$BIN write_vk -o vk $FLAGS $BFLAG
$BIN verify -k vk -p proof $FLAGS