#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG"
######## WORKTODO: deprecated, plonk-only
# Test we can perform the proof/verify flow.
$BIN OLD_API gates $FLAGS $BFLAG > /dev/null
$BIN OLD_API prove -o proof $FLAGS $BFLAG
$BIN OLD_API write_vk -o vk $FLAGS $BFLAG
$BIN OLD_API write_pk -o pk $FLAGS $BFLAG
$BIN OLD_API verify -k vk -p proof $FLAGS

# Check supplemental functions.
# Grep to determine success.
$BIN OLD_API contract -k vk $BFLAG -o - | grep "Verification Key Hash" > /dev/null
# Use jq to determine success, and also check result not empty.
OUTPUT=$($BIN OLD_API proof_as_fields -p proof -k vk -o - | jq .)
[ -n "$OUTPUT" ] || exit 1
OUTPUT=$($BIN OLD_API vk_as_fields -k vk -o - | jq .)
[ -n "$OUTPUT" ] || exit 1
