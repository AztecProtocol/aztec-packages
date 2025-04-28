#!/usr/bin/env bash
# Exit on error
set -e

export NARGO=${NARGO:-../../../../noir/noir-repo/target/release/nargo}

# Function to check if compilation error matches expected error
check_compilation_error() {
    local contract_dir=$1
    local expected_error_file="$contract_dir/expected_error"

    # Skip if no expected_error file exists
    if [ ! -f "$expected_error_file" ]; then
        echo "Warning: No expected_error file found in $contract_dir"
        return 0
    fi

    # Get expected error message
    local expected_error=$(cat "$expected_error_file")

    # Run nargo compile and capture output including stderr
    local actual_output
    if ! actual_output=$(cd "$contract_dir" && $NARGO compile 2>&1); then
        # Check if actual error contains expected error
        if echo "$actual_output" | grep -q "$expected_error"; then
            echo "✓ $contract_dir: Compilation failed as expected with correct error"
            return 0
        else
            echo "✗ $contract_dir: Expected error:"
            echo "$expected_error"
            echo "But got:"
            echo "$actual_output"
            return 1
        fi
    else
        echo "✗ $contract_dir: Expected compilation to fail but it succeeded"
        return 1
    fi
}

# Main script
echo "Testing compilation failures..."

# Iterate through all directories in contracts/
for contract_dir in contracts/*/; do
    if [ -d "$contract_dir" ]; then
        check_compilation_error "$contract_dir"
    fi
done
