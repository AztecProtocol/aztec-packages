#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG"
# the commands called here are subcommands of the OLD_API command in the native bb binary,
# but no such refactoring was done to the node binary. This is because the node binary is
# deprecated and UltraPlonk is also deprecated.
MAYBE_OLD_API=${NATIVE:+OLD_API}

# Test we can perform the proof/verify flow.
$BIN $MAYBE_OLD_API gates $FLAGS $BFLAG > /dev/null
$BIN $MAYBE_OLD_API prove -o proof $FLAGS $BFLAG
$BIN $MAYBE_OLD_API write_vk -o vk $FLAGS $BFLAG
$BIN $MAYBE_OLD_API write_pk -o pk $FLAGS $BFLAG
$BIN $MAYBE_OLD_API verify -k vk -p proof $FLAGS

# Check supplemental functions.
# Grep to determine success.
$BIN $MAYBE_OLD_API contract -k vk $BFLAG -o - | grep "Verification Key Hash" > /dev/null
# Use jq to determine success, and also check result not empty.
OUTPUT=$($BIN $MAYBE_OLD_API proof_as_fields -p proof -k vk -o - | jq .)
[ -n "$OUTPUT" ] || exit 1
OUTPUT=$($BIN $MAYBE_OLD_API vk_as_fields -k vk -o - | jq .)
[ -n "$OUTPUT" ] || exit 1
