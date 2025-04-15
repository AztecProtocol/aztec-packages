#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

test_title "Basic flow"

AMOUNT=42

# docs:start:import-test-accounts
aztec-wallet import-test-accounts
# docs:end:import-test-accounts
aztec-wallet deploy token_contract@Token --args accounts:test0 Test TST 18 -f test0
aztec-wallet send mint_to_public -ca last --args accounts:test0 $AMOUNT -f test0
RESULT=$(aztec-wallet simulate balance_of_public -ca last --args accounts:test0 -f test0 | grep "Simulation result:" | awk '{print $3}')

section "Account public balance is ${RESULT}"

assert_eq ${RESULT} "${AMOUNT}n"
