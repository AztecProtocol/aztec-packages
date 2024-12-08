#!/bin/bash
set -e
source ../utils/setup.sh

test_title "Profile private transfer with authwit"

echo
warn //////////////////////////////////////////////////////////////////////////////
warn // Note: this test requires proving to be enabled to show meaningful output //
warn //////////////////////////////////////////////////////////////////////////////
echo

# Deploy account contracts for owner (token deployer and minter),
# operator (who use authwit to transfer token from user's account) and user
aztec-wallet create-account -a owner
aztec-wallet create-account -a user
aztec-wallet create-account -a operator

# Deploy a token contract and mint 100 tokens to the user
aztec-wallet deploy token_contract@Token --args accounts:owner Test TST 18 -f owner -a token
aztec-wallet send mint_to_private -ca token --args accounts:owner accounts:user 100 -f owner

# Create an authwit for the operator to transfer tokens from the user's account (to operator's own acc)
aztec-wallet create-secret -a auth_nonce
aztec-wallet create-authwit transfer_in_private operator -ca token --args accounts:user accounts:operator 100 secrets:auth_nonce -f user
aztec-wallet add-authwit authwits:last user -f operator

# Simulate and profile `transfer_in_private`
aztec-wallet simulate --profile transfer_in_private -ca token --args accounts:user accounts:operator 100 secrets:auth_nonce -f operator

# Verify gate count is present in the output
GATE_COUNT=$(aztec-wallet simulate --profile transfer_in_private -ca token --args accounts:user accounts:operator 100 secrets:auth_nonce -f operator | grep "Total gates:" | awk '{print $3}')
if [ -z "$GATE_COUNT" ]; then
    GATE_COUNT_SET=0
else
    GATE_COUNT_SET=1
fi

assert_eq $GATE_COUNT_SET 1