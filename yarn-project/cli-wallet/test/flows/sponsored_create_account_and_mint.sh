#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

test_title "Create new account and mint privately. Fees paid by a sponsor."

MINT_AMOUNT=42

source $flows/shared/deploy_sponsored_fpc_and_token.sh

# docs:start:fpc-sponsored
PAYMENT_METHOD="--payment method=fpc-sponsored,fpc=contracts:sponsoredFPC"
# docs:end:fpc-sponsored

aztec-wallet create-account -a user $PAYMENT_METHOD

aztec-wallet send set_minter -ca token --args accounts:user true -f test0 $PAYMENT_METHOD

aztec-wallet send mint_to_private -ca token --args accounts:user $MINT_AMOUNT -f user $PAYMENT_METHOD

RESULT=$(aztec-wallet simulate balance_of_private -ca token --args accounts:user -f user | grep "Simulation result:" | awk '{print $3}')

assert_eq ${RESULT} "${MINT_AMOUNT}n"
