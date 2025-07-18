#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

test_title "Tx management"

aztec-wallet import-test-accounts
aztec-wallet deploy counter_contract@Counter --init initialize --args 0 accounts:test0 -a counter -f test0
aztec-wallet send increment -ca counter --args accounts:test0 -f test0

TX_LIST=$(aztec-wallet get-tx)

echo "${TX_LIST}"

TX_HASH=$(echo "${TX_LIST}" | grep "transactions:last" | awk '{print $3}')

section Last transaction hash is ${TX_HASH}

TX_STATUS=$(aztec-wallet get-tx ${TX_HASH} | grep "Status: " | awk '{print $2}')

assert_eq ${TX_STATUS} "success"
