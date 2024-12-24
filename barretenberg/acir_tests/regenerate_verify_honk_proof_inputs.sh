#!/usr/bin/env bash
# Env var overrides:
#   BIN: to specify a different binary to test with (e.g. bb.js or bb.js-dev).
set -eu

BIN=${BIN:-../cpp/build/bin/bb}
CRS_PATH=~/.bb-crs
BRANCH=master
VERBOSE=${VERBOSE:+-v}

if [ -f "$BIN" ]; then
    BIN=$(realpath "$BIN")
else
    BIN=$(realpath "$(which "$BIN")")
fi

export BRANCH

# The program for which a proof will be recursively verified
PROGRAM=assert_statement
# The programs containing the recursive verifier
RECURSIVE_PROGRAMS=(verify_honk_proof verify_rollup_honk_proof)

./reset_acir_tests.sh --no-rebuild-nargo --programs "$PROGRAM"
cd "acir_tests/$PROGRAM"

# Base directory for TOML outputs
BASE_TOML_DIR=../../../../noir/noir-repo/test_programs/execution_success

for RECURSIVE_PROGRAM in "${RECURSIVE_PROGRAMS[@]}"; do
    TOML_DIR="$BASE_TOML_DIR/$RECURSIVE_PROGRAM"

    if [ ! -d "$TOML_DIR" ]; then
        echo "Error: Directory $TOML_DIR does not exist."
        exit 1
    fi

    echo "Generating recursion inputs for $RECURSIVE_PROGRAM and writing to directory $TOML_DIR"

    # Decide the command based on the recursive program
    if [[ "$RECURSIVE_PROGRAM" == "verify_rollup_honk_proof" ]]; then
        COMMAND="write_recursion_inputs_rollup_honk"
    else
        COMMAND="write_recursion_inputs_honk"
    fi

    $BIN "$COMMAND" --recursive $VERBOSE -c "$CRS_PATH" -b ./target/program.json -o "$TOML_DIR"
done

cd ../..
./reset_acir_tests.sh --no-rebuild-nargo --programs "${RECURSIVE_PROGRAMS[@]}"
