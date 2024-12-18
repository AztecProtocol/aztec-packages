#!/usr/bin/env bash
# Env var overrides:
#   BIN: to specify a different binary to test with (e.g. bb.js or bb.js-dev).
set -eu

BIN=${BIN:-../cpp/build/bin/bb}
CRS_PATH=~/.bb-crs
BRANCH=master
VERBOSE=${VERBOSE:+-v}

if [ -f $BIN ]; then
    BIN=$(realpath $BIN)
else
    BIN=$(realpath $(which $BIN))
fi

export BRANCH

# the program for which a proof will be recursively verified
PROGRAM=assert_statement
# the program containing the recursive verifier
RECURSIVE_PROGRAM=verify_rollup_honk_proof

./reset_acir_tests.sh --no-rebuild-nargo --programs "$PROGRAM"
cd "acir_tests/$PROGRAM"

TOML_DIR=../../../../noir/noir-repo/test_programs/execution_success/"$RECURSIVE_PROGRAM"
if [ ! -d "$TOML_DIR" ]; then
    echo "Error: Directory $TOML_DIR does not exist."
    exit 1
fi

echo "Generating recursion inputs and writing to directory $TOML_DIR"
$BIN write_recursion_inputs_rollup_honk $VERBOSE -c $CRS_PATH -b ./target/program.json -o "$TOML_DIR" --recursive

cd ../..
./reset_acir_tests.sh --no-rebuild-nargo --programs "$RECURSIVE_PROGRAM"