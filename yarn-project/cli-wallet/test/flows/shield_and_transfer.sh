#!/bin/bash
set -e
source ../utils/setup.sh

echo "Test: Shield and private transfer"
echo

aztec-wallet create-account -a main
aztec-wallet deploy token_contract@Token --args accounts:main Test TST 18 -ac main
aztec-wallet add-secret -a shield
aztec-wallet send mint_private -ca contracts:last --args 42 secrets:shield -ac main
aztec-wallet add-note TransparentNote pending_shields -ca contracts:last -h transactions:last -a accounts:main -f 42 secrets:shield
aztec-wallet send redeem_shield -ca contracts:last --args accounts:main 42 secrets:shield -ac main

actec-wallet create-acccount -a recipient

aztec-wallet send transfer_private -ca contracts-last --args accounts:recipient 21 -ac main

RESULT_MAIN=$(aztec-wallet simulate balance_of_private -ca contracts:last --args accounts:main -ac main | grep "Simulation result:" | awk '{print $3}')
RESULT_RECIPIENT=$(aztec-wallet simulate balance_of_private -ca contracts:last --args accounts:recipient -ac recipient | grep "Simulation result:" | awk '{print $3}')

if [ $RESULT_main = $RESULT_RECIPIENT ]; then
    echo
    echo "Test passed"
else 
    exit 1
fi

echo
echo "---------------------------------"