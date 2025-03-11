#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

test_title "Profile private transfer with authwit"

echo
warn //////////////////////////////////////////////////////////////////////////////
warn // Note: this test requires proving to be enabled to show meaningful output //
warn //////////////////////////////////////////////////////////////////////////////
echo

source $flows/shared/deploy_main_account_and_token.sh
source $flows/shared/mint_to_private.sh 100 main
source $flows/shared/create_funded_account.sh operator

# Create an authwit for the operator to transfer tokens from the main account to operator's own account.
aztec-wallet create-secret -a auth_nonce
aztec-wallet create-authwit transfer_in_private operator -ca token --args accounts:main accounts:operator 100 secrets:auth_nonce -f main
aztec-wallet add-authwit authwits:last main -f operator

# Simulate and profile `transfer_in_private`
GATE_COUNT=$(aztec-wallet simulate --profile transfer_in_private -ca token --args accounts:main accounts:operator 100 secrets:auth_nonce -f operator | grep "Total gates:" | awk '{print $3}')

echo "GATE_COUNT: $GATE_COUNT"

# Verify gate count is present in the output
if [ -z "$GATE_COUNT" ]; then
    GATE_COUNT_SET=0
else
    GATE_COUNT_SET=1
fi

assert_eq $GATE_COUNT_SET 1
