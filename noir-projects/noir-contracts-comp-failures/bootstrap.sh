#!/usr/bin/env bash

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

# nargo command path relative to the individual contract directory
export NARGO=${NARGO:-../../../../noir/noir-repo/target/release/nargo}
export NOIR_HASH=${NOIR_HASH:- $(../../noir/bootstrap.sh hash)}

# Function to check if compilation error matches expected error
check_compilation_error() {
    local contract_dir=$1
    local expected_error_file="$contract_dir/expected_error"

    # Skip if no expected_error file exists
    if [ ! -f "$expected_error_file" ]; then
        echo "Warning: No expected_error file found in $contract_dir"
        return 0
    fi

    # Get expected error message and trim whitespace
    local expected_error=$(cat "$expected_error_file" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

    # Run nargo compile and capture output including stderr
    local actual_output
    if ! actual_output=$(cd "$contract_dir" && $NARGO compile --silence-warnings 2>&1); then
        # Normalize actual output whitespace
        actual_output=$(echo "$actual_output" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

        # Check if actual error contains expected error, ignoring whitespace
        if echo "$actual_output" | grep -F "$expected_error" > /dev/null; then
            echo "✓ $contract_dir: Compilation failed as expected with correct error"
        else
            echo "✗ $contract_dir: Expected error:"
            echo "$expected_error"
            echo "But got:"
            echo "$actual_output"
            exit 1
        fi
    else
        echo "✗ $contract_dir: Expected compilation to fail but it succeeded"
        exit 1
    fi
}

# Tests that compilation of contracts in noir-contracts-comp-failures fails with the expected error message.
test() {
    # Iterate through all directories in contracts/
    for contract_dir in contracts/*/; do
        if [ -d "$contract_dir" ]; then
            check_compilation_error "$contract_dir"
        fi
    done
}

function test_cmds {
    hash=$(hash_str $NOIR_HASH $(cache_content_hash ^noir-projects/noir-contracts-comp-failures))
    echo "$hash ./noir-projects/noir-contracts-comp-failures/bootstrap.sh test"
}

case "$cmd" in
  test|test_cmds)
    $cmd
    ;;
  *)
    echo_stderr "Unknown command: $cmd"
    exit 1
esac
