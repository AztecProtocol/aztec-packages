#!/bin/bash
# prove_then_verify produces intermediate state. We use process substitution to make parallel safe.
set -eux

BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH ${VERBOSE:+-v}"
[ "${RECURSIVE}" = "true" ] && FLAGS+=" --recursive"

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
    $BIN OLD_API verify$SYS $FLAGS \
        -k <($BIN OLD_API write_vk$SYS -o - $FLAGS $BFLAG) \
        -p <($BIN OLD_API prove$SYS -o - $FLAGS $BFLAG)
  ;;
  "ultra_honk")
    # WORKTODO: hash affects verification key, without it,
    #   eg OinkVerifier::execute_preamble_round: proof circuit size (32) does not match verification key circuit size (64)!
    FLAGS+=" --scheme $SYS --oracle_hash ${HASH:-poseidon2}"
    [ "${ROLLUP:-false}" = "true" ] && FLAGS+=" --ipa_accumulation"
    $BIN prove $FLAGS $BFLAG -o target
    $BIN write_vk $FLAGS $BFLAG -o target
    $BIN verify $FLAGS  -k target/vk -p target/proof

    # [ "${ROLLUP:-false}" = "true" ] && FLAGS+=" --ipa_accumulation true"
    # $BIN prove $FLAGS $BFLAG -o target $([[ "${ROLLUP:-false}" == "true" ]] && echo '--ipa_accumulation')
    # $BIN write_vk $FLAGS $BFLAG -o target
    # $BIN verify $FLAGS  -k target/vk -p target/proof $([[ "${ROLLUP:-false}" == "true" ]] && echo '--ipa_accumulation')


    # $BIN verify $FLAGS \
    #     -k <($BIN write_vk $FLAGS $BFLAG -o - ) \
    #     -p <($BIN prove $FLAGS $BFLAG -o - )
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
