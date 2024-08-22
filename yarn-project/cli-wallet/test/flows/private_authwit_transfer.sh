#!/bin/bash
set -e
source ../utils/setup.sh

test_title "Private transfer on behalf of other"

MINT_AMOUNT=42
TRANSFER_AMOUNT=21

echo $()

source $TEST_FOLDER/token_utils/create_main_and_mint.sh $MINT_AMOUNT

aztec-wallet create-account -a operator

aztec-wallet create-secret -a auth_nonce
aztec-wallet authorize-action transfer_from operator -ca token --args accounts:main accounts:operator $TRANSFER_AMOUNT secrets:auth_nonce -f main

aztec-wallet send transfer_from -ca token --args accounts:main accounts:operator $TRANSFER_AMOUNT secrets:auth_nonce -f operator

RESULT_MAIN=$(aztec-wallet simulate balance_of_private -ca token --args accounts:main -f main | grep "Simulation result:" | awk '{print $3}')
RESULT_RECIPIENT=$(aztec-wallet simulate balance_of_private -ca token --args accounts:recipient -f recipient | grep "Simulation result:" | awk '{print $3}')

section "Main account private balance is ${RESULT_MAIN}, recipient account private balance is ${RESULT_RECIPIENT}"

assert_eq ${RESULT_MAIN} ${RESULT_RECIPIENT}
