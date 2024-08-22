#!/bin/bash
set -e
source ../utils/setup.sh

test_title "Shield and private transfer"

MINT_AMOUNT=42
TRANSFER_AMOUNT=21

aztec-wallet create-account -a main
aztec-wallet deploy token_contract@Token --args accounts:main Test TST 18 -f main -a token
aztec-wallet create-secret -a shield
aztec-wallet send mint_private -ca token --args $MINT_AMOUNT secrets:shield:hash -f main
aztec-wallet add-note TransparentNote pending_shields -ca token -t last -a main -b $MINT_AMOUNT secrets:shield:hash
aztec-wallet send redeem_shield -ca token --args accounts:main $MINT_AMOUNT secrets:shield -f main

aztec-wallet create-account -a recipient

aztec-wallet send transfer -ca token --args accounts:recipient $TRANSFER_AMOUNT -f main

RESULT_MAIN=$(aztec-wallet simulate balance_of_private -ca token --args accounts:main -f main | grep "Simulation result:" | awk '{print $3}')
RESULT_RECIPIENT=$(aztec-wallet simulate balance_of_private -ca token --args accounts:recipient -f recipient | grep "Simulation result:" | awk '{print $3}')

section "Main account private balance is ${RESULT_MAIN}, recipient account private balance is ${RESULT_RECIPIENT}"

assert_eq ${RESULT_MAIN} ${RESULT_RECIPIENT}
