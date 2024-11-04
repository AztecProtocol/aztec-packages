#!/bin/sh
set -eux

VFLAG=${VERBOSE:+-v}
BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH $VFLAG"
if [ "${RECURSIVE}" = "true" ]; then
    FLAGS="$FLAGS --recursive"
fi

# Test we can perform the proof/verify flow.
# This ensures we test independent pk construction through real/garbage witness data paths.
$BIN prove_ultra_honk -o proof $FLAGS $BFLAG
$BIN write_vk_ultra_honk -o vk $FLAGS $BFLAG
$BIN verify_ultra_honk -k vk -p proof $FLAGS
