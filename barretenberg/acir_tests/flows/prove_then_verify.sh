#!/bin/bash
# prove_then_verify produces intermediate state. We use process substitution to make parallel safe.
set -eu

BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH ${VERBOSE:+-v}"
[ "${RECURSIVE}" = "true" ] && FLAGS+=" --initialize_accumulator"

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

case ${SYS:-} in
  "")
    [ -n "${SYS:-}" ] && SYS="_$SYS" || SYS=""
    $BIN verify$SYS $FLAGS \
        -k <($BIN write_vk$SYS -o - $FLAGS $BFLAG) \
        -p <($BIN prove$SYS -o - $FLAGS $BFLAG)
    ;;
  "ultra_honk")
    FLAGS+=" --scheme $SYS"
    [ "${ROLLUP:-false}" = "true" ] && FLAGS+=" --ipa_accumulation"

    # WORKTODO: issue with public inputs in a few of the stack tests; eg fold_complex_outputs
    $BIN verify $FLAGS \
        -k <($BIN write_vk -o - $FLAGS $BFLAG --input_type ${INPUT_TYPE:-compiletime_stack} --output_data bytes) \
        -p <($BIN prove --output_content proof --oracle_hash ${HASH:-poseidon2} -o - $FLAGS $BFLAG --input_type ${INPUT_TYPE:-compiletime_stack} --output_data bytes)
  ;;
  "ultra_honk_deprecated")
    # deprecated flow is necessary until we finish C++ api refactor and then align ts api
    SYS_DEP=_ultra_honk
    $BIN verify$SYS_DEP $FLAGS \
        -k <($BIN write_vk$SYS_DEP -o - $FLAGS $BFLAG) \
        -p <($BIN prove$SYS_DEP -o - $FLAGS $BFLAG)
    ;;
  *)
    [ -n "${SYS:-}" ] && SYS="_$SYS" || SYS=""
    $BIN verify$SYS $FLAGS \
        -k <($BIN write_vk$SYS -o - $FLAGS $BFLAG) \
        -p <($BIN prove$SYS -o - $FLAGS $BFLAG)
    ;;
esac
