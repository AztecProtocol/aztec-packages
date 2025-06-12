#!/usr/bin/env bash
# prove_then_verify produces intermediate state. We use process substitution to make parallel safe.
set -eu

BFLAG="-b ./target/program.json"
FLAGS="-c $CRS_PATH ${VERBOSE:+-v}"
[ "${RECURSIVE}" = "true" ] && FLAGS+=" --recursive"

# Test we can perform the proof/verify flow.
# This ensures we test independent pk construction through real/garbage witness data paths.
# We use process substitution pipes to avoid temporary files, which need cleanup, and can collide with parallelism.

case ${SYS:-} in
  "")
    # Deprecated; used for old node cli
    [ -n "${SYS:-}" ] && SYS="_$SYS" || SYS=""
    $BIN verify$SYS $FLAGS \
        -k <($BIN write_vk$SYS -o - $FLAGS $BFLAG) \
        -p <($BIN prove$SYS -o - $FLAGS $BFLAG)
  ;;
  "ultra_honk")
    FLAGS+=" --scheme $SYS --oracle_hash ${HASH:-poseidon2}"
    [ "${ROLLUP:-false}" = "true" ] && FLAGS+=" --ipa_accumulation"
    [ "${RECURSIVE}" = "true" ] && FLAGS+=" --init_kzg_accumulator"

    OUTDIR=$(mktemp -d)
    trap "rm -rf $OUTDIR" EXIT
    $BIN write_vk $FLAGS $BFLAG -o $OUTDIR
    $BIN prove $FLAGS $BFLAG -k $OUTDIR/vk -o $OUTDIR
    $BIN verify $FLAGS \
        -k $OUTDIR/vk \
        -p $OUTDIR/proof \
        -i $OUTDIR/public_inputs
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
