#!/bin/bash

# Checks that the generated contract templates (honk_contract.hpp, honk_zk_contract.hpp,
# honk_optimized_contract.hpp) are up-to-date with their Solidity source files.
# Fails with a diff if any file is stale.

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
SCRIPT_DIR="$REPO_ROOT/barretenberg/sol/scripts"
CPP_DIR="$REPO_ROOT/barretenberg/cpp/src/barretenberg/dsl/acir_proofs"

FILES=(honk_contract.hpp honk_zk_contract.hpp honk_optimized_contract.hpp honk_zk_optimized_contract.hpp)

# Save copies of the current generated files
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

for FILE in "${FILES[@]}"; do
    cp "$CPP_DIR/$FILE" "$TEMP_DIR/$FILE"
done

# Regenerate all three files
"$SCRIPT_DIR/copy_to_cpp.sh" -f
"$SCRIPT_DIR/copy_optimized_to_cpp.sh" -f

# Compare and collect failures
FAILED=0

for FILE in "${FILES[@]}"; do
    if ! diff -u "$TEMP_DIR/$FILE" "$CPP_DIR/$FILE" > "$TEMP_DIR/$FILE.diff" 2>&1; then
        echo "ERROR: $FILE is out of sync with Solidity sources."
        echo ""
        cat "$TEMP_DIR/$FILE.diff"
        echo ""
        FAILED=1
    fi
done

# Restore originals (so we don't modify the working tree)
for FILE in "${FILES[@]}"; do
    cp "$TEMP_DIR/$FILE" "$CPP_DIR/$FILE"
done

if [ "$FAILED" -eq 1 ]; then
    echo "Generated contract templates are out of sync with Solidity sources."
    echo "Run './barretenberg/sol/scripts/copy_to_cpp.sh --all' and './barretenberg/sol/scripts/copy_optimized_to_cpp.sh -f' to regenerate (both scripts now handle ZK and non-ZK by default)."
    exit 1
fi

echo "Generated contract templates are in sync with Solidity sources."
