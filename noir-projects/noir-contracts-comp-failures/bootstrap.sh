#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# nargo command path relative to the individual contract directory
export NARGO=${NARGO:-../../../../noir/noir-repo/target/release/nargo}

# Function to check if compilation error matches expected error.
#
# When ACCEPT_SNAPSHOTS=1, the full nargo stderr is written to expected_error
# instead of asserting against it. Use this locally to regenerate snapshots
# after an intentional compiler error message change; then trim the committed
# file down to a stable substring (stderr includes paths/line numbers that
# churn). CI refuses to run with ACCEPT_SNAPSHOTS set (see test()).
check_compilation_error() {
    local contract_dir=$1
    local expected_error_file="$contract_dir/expected_error"

    # Run nargo compile and capture output including stderr.
    local actual_output
    local compile_rc=0
    actual_output=$(cd "$contract_dir" && $NARGO compile --silence-warnings 2>&1) || compile_rc=$?

    if [ "$compile_rc" -eq 0 ]; then
        echo "✗ $contract_dir: Expected compilation to fail but it succeeded"
        exit 1
    fi

    if [ -n "${ACCEPT_SNAPSHOTS:-}" ]; then
        echo "$actual_output" > "$expected_error_file"
        echo "↻ $contract_dir: wrote expected_error (trim to a stable substring before committing)"
        return 0
    fi

    if [ ! -f "$expected_error_file" ]; then
        echo "✗ $contract_dir: No expected_error file. Run with ACCEPT_SNAPSHOTS=1 to generate one."
        exit 1
    fi

    # Get expected error message and trim whitespace
    local expected_error=$(cat "$expected_error_file" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

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
}

# Tests that compilation of contracts in noir-contracts-comp-failures fails with the expected error message.
test() {
    if [ -n "${ACCEPT_SNAPSHOTS:-}" ] && [ "${CI:-0}" = "1" ]; then
        echo "ACCEPT_SNAPSHOTS is not permitted in CI. Snapshots must be regenerated locally and committed." >&2
        exit 1
    fi

    # Iterate through all directories in contracts/
    for contract_dir in contracts/*/; do
        if [ -d "$contract_dir" ]; then
            check_compilation_error "$contract_dir"
        fi
    done
}

function test_cmds {
    # Fairies want to run these tests on every PR
    if [ "${TARGET_BRANCH:-}" = "merge-train/fairies" ]; then
      hash=disabled-cache
    else
      hash=$(hash_str $(../../noir/bootstrap.sh hash) $(cache_content_hash ^noir-projects/noir-contracts-comp-failures))
    fi
    echo "$hash ./noir-projects/noir-contracts-comp-failures/bootstrap.sh test"
}

case "$cmd" in
  *)
    default_cmd_handler "$@"
    ;;
esac
