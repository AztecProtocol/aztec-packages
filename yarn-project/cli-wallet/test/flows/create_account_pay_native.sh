#!/usr/bin/env bash

source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

test_title "Create an account and deploy using native fee payment with bridging"

# docs:start:bridge-fee-juice
aztec-wallet create-account -a main --register-only
aztec-wallet bridge-fee-juice main --no-wait
# docs:end:bridge-fee-juice


section "Use a pre-funded test account to send dummy txs to force block creations"

aztec-wallet import-test-accounts
# docs:start:force-two-blocks
aztec-wallet deploy counter_contract@Counter --init initialize --args 0 accounts:test0 -f test0 -a counter
aztec-wallet send increment -ca counter --args accounts:test0 accounts:test0 -f test0
# docs:end:force-two-blocks


section "Deploy main account claiming the fee juice, use it later"

# docs:start:claim-deploy-account
aztec-wallet deploy-account -f main --payment method=fee_juice,claim
# docs:end:claim-deploy-account
aztec-wallet send increment -ca counter --args accounts:main accounts:main -f main
aztec-wallet send increment -ca counter --args accounts:main accounts:main -f main

RESULT=$(aztec-wallet simulate get_counter -ca counter --args accounts:main -f main | grep "Simulation result:" | awk '{print $3}')

section "Counter is ${RESULT}"

assert_eq ${RESULT} "2n"
