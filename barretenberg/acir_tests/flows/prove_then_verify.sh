#!/bin/bash
# prove_then_verify produces intermediate state. We use process substitution to make parallel safe.
set -eu

BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH ${VERBOSE:+-v}"
[ "${RECURSIVE}" = "true" ] && FLAGS+=" --recursive"
[ -n "${SYS:-}" ] && SYS="_$SYS" || SYS=""

# TODO: Use this when client ivc support write_vk. Currently it keeps its own flow.
# case ${SYS:-} in
#   "")
#     prove_cmd=prove
#     verify_cmd=verify
#     ;;
#   "client_ivc")
#     prove_cmd=prove
#     verify_cmd=verify
#     flags+=" --scheme client_ivc --input_type ${INPUT_TYPE:-compiletime_stack}"
#     ;;
#   *)
#     prove_cmd=prove_$SYS
#     verify_cmd=verify_$SYS
#     ;;
# esac

# Test we can perform the proof/verify flow.
# This ensures we test independent pk construction through real/garbage witness data paths.
# We use process substitution pipes to avoid temporary files, which need cleanup, and can collide with parallelism.
$BIN verify$SYS $FLAGS \
    -k <($BIN write_vk$SYS -o - $FLAGS $BFLAG) \
    -p <($BIN prove$SYS -o - $FLAGS $BFLAG)
