#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

test_title "Private transfer on behalf of other"

MINT_AMOUNT=42
TRANSFER_AMOUNT=21

source $flows/shared/deploy_main_account_and_token.sh
source $flows/shared/mint_to_private.sh $MINT_AMOUNT main
source $flows/shared/create_funded_account.sh operator

aztec-wallet create-secret -a auth_nonce
aztec-wallet create-authwit transfer_in_private operator -ca token --args accounts:main accounts:operator $TRANSFER_AMOUNT secrets:auth_nonce -f main

aztec-wallet send transfer_in_private -ca token --args accounts:main accounts:operator $TRANSFER_AMOUNT secrets:auth_nonce -aw authwits:last -f operator

RESULT_MAIN=$(aztec-wallet simulate balance_of_private -ca token --args accounts:main -f main | grep "Simulation result:" | awk '{print $3}')
RESULT_RECIPIENT=$(aztec-wallet simulate balance_of_private -ca token --args accounts:operator -f operator | grep "Simulation result:" | awk '{print $3}')

section "Main account private balance is ${RESULT_MAIN}, operator account private balance is ${RESULT_RECIPIENT}"

assert_eq ${RESULT_MAIN} ${RESULT_RECIPIENT}
