#!/usr/bin/env bash
# Within failure_contracts, we have contracts that should fail compilation due to code in the macros
# This script will test that compilation fails for each of the contracts in failure_contracts

REPO=$(git rev-parse --show-toplevel)
NARGO=${NARGO:-"$REPO/noir/noir-repo/target/release/nargo"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Initialize counters
total_tests=0
passed_tests=0

# Function to test compilation failure
test_compilation_failure() {
    local contract_dir=$1
    ((total_tests++))

    echo "Testing compilation failure for: $contract_dir"

    # Try to compile the contract
    if cd "$contract_dir" && $NARGO compile --pedantic-solving 2>/dev/null; then
        echo -e "${RED}❌ Test failed: Compilation succeeded when it should have failed for $contract_dir${NC}"
        cd - > /dev/null
        return 1
    else
        echo -e "${GREEN}✓ Test passed: Compilation failed as expected for $contract_dir${NC}"
        cd - > /dev/null
        ((passed_tests++))
        return 0
    fi
}

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FAILURE_CONTRACTS_DIR="$SCRIPT_DIR/failure_contracts"

# Test each contract in the failure_contracts directory
for contract in "$FAILURE_CONTRACTS_DIR"/*; do
    if [ -d "$contract" ]; then
        test_compilation_failure "$contract"
    fi
done

# Print summary
echo -e "\nTest Summary:"
echo -e "Total tests: $total_tests"
echo -e "Passed tests: $passed_tests"
echo -e "Failed tests: $((total_tests - passed_tests))"

# Exit with failure if any test didn't pass
[ "$total_tests" -eq "$passed_tests" ] || exit 1
