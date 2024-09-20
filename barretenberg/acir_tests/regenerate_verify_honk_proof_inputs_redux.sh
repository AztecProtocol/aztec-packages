#!/usr/bin/env bash
# Env var overrides:
#   BIN: to specify a different binary to test with (e.g. bb.js or bb.js-dev).
set -eu

BIN=${BIN:-../cpp/build/bin/bb}
CRS_PATH=~/.bb-crs
BRANCH=master
VERBOSE=${VERBOSE:-}
RECURSIVE=true
PROOF_NAME="proof_a"

if [ -f $BIN ]; then
    BIN=$(realpath $BIN)
else
    BIN=$(realpath $(which $BIN))
fi

export BRANCH

./reset_acir_tests.sh --rebuild-nargo --programs assert_statement_recursive

cd acir_tests/assert_statement_recursive

PROOF_DIR=$PWD/proofs
# PROOF_PATH=$PROOF_DIR/$PROOF_NAME
VFLAG=${VERBOSE:+-v}
RFLAG=${RECURSIVE:+-r}

echo "Make proof dir..."
[ -d "$PROOF_DIR" ] || mkdir $PWD/proofs
# [ -e "$PROOF_PATH" ] || touch $PROOF_PATH
echo "Generating recursion inputs..."
$BIN write_recursion_inputs_honk $VFLAG -c $CRS_PATH -b ./target/program.json -o "./proofs"