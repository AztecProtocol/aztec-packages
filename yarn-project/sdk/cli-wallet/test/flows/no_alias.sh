#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

test_title "Basic flow, no aliases"

AMOUNT=42

aztec-wallet import-test-accounts
aztec-wallet create-account -f test0
ACCOUNT_ADDRESS=$(aztec-wallet create-account -f test0 | grep "Address:" | awk '{print $2}')
TOKEN_ADDRESS=$(aztec-wallet deploy ./target/token_contract-Token.json --args accounts:test0 Test TST 18 -f test0 | grep "Contract deployed at" | awk '{print $4}')
aztec-wallet send mint_to_public -c ./target/token_contract-Token.json -ca $TOKEN_ADDRESS --args $ACCOUNT_ADDRESS $AMOUNT -f test0
RESULT=$(aztec-wallet simulate balance_of_public -c ./target/token_contract-Token.json -ca $TOKEN_ADDRESS --args $ACCOUNT_ADDRESS -f $ACCOUNT_ADDRESS | grep "Simulation result:" | awk '{print $3}')

section "Main account public balance is ${RESULT}"

assert_eq ${RESULT} "${AMOUNT}n"
