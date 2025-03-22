#!/usr/bin/env bash

source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

test_title "Create an account and deploy using native fee payment with bridging"

aztec-wallet create-account -a main --register-only
aztec-wallet bridge-fee-juice 1000000000000000000 main --mint --no-wait


section "Use a pre-funded test account to send dummy txs to force block creations"

aztec-wallet import-test-accounts
aztec-wallet deploy counter_contract@Counter --init initialize --args 0 accounts:test0 -f test0 -a counter
aztec-wallet send increment -ca counter --args accounts:test0 accounts:test0 -f test0


section "Deploy main account claiming the fee juice, use it later"

aztec-wallet deploy-account -f main --payment method=fee_juice,claim
aztec-wallet send increment -ca counter --args accounts:main accounts:main -f main
aztec-wallet send increment -ca counter --args accounts:main accounts:main -f main

RESULT=$(aztec-wallet simulate get_counter -ca counter --args accounts:main -f main | grep "Simulation result:" | awk '{print $3}')

section "Counter is ${RESULT}"

assert_eq ${RESULT} "2n"
