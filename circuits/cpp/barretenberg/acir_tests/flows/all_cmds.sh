#!/bin/sh
set -eu

NAME=$(basename $PWD)

if [ -n "$VERBOSE" ]; then
  VFLAG="-v"
else
  VFLAG=""
fi

BFLAG="-b ./target/${NAME}.bytecode"
FLAGS="-c $CRS_PATH $VFLAG"

# Test we can perform the proof/verify flow.
$BIN gates $FLAGS $BFLAG > /dev/null
$BIN prove -o proof $FLAGS $BFLAG
$BIN write_vk -o vk $FLAGS $BFLAG
$BIN verify -k vk -p proof $FLAGS

# Check supplemental functions.
$BIN contract -k vk $BFLAG -o - | grep "Verification Key Hash" > /dev/null
$BIN proof_as_fields -k vk -p proof -o proof_as_fields
$BIN vk_as_fields -k vk -o - > vk_as_fields