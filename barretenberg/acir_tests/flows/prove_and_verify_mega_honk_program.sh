#!/bin/sh
set -eu

VFLAG=${VERBOSE:+-v}

# this flow is deprecated. currently it is bb.js only. for bb is is replaced by:
# prove_and_verify --scheme client_ivc --input-type compiletime_stack
# NB: In general, it is not meaningful to produce a MegaHonk proof an its own since
#     the MegaHonk proof does not attest to the correctness of every possible kind
#     of gate that could appear in a Mega execution trace.
$BIN prove_and_verify_mega_honk_program $VFLAG -c $CRS_PATH -b ./target/program.json
