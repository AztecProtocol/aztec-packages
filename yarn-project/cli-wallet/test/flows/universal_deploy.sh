#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

test_title "Universal deploy flow"

aztec-wallet import-test-accounts

ZERO_ADDR=0x0000000000000000000000000000000000000000000000000000000000000000

section "Deploy with --universal -f (deployer should be 0x0)"
OUTPUT=$(aztec-wallet deploy token_contract@Token --args accounts:test0 Test TST 18 --universal -f test0 --salt 0x1)
echo "$OUTPUT"
DEPLOYER=$(echo "$OUTPUT" | grep "Deployer:" | awk '{print $2}')
section "Deployer is ${DEPLOYER}"
assert_eq "${DEPLOYER}" "${ZERO_ADDR}"

section "Verify the contract is functional"
AMOUNT=42
aztec-wallet send mint_to_public -ca last --args accounts:test0 $AMOUNT -f test0
RESULT=$(aztec-wallet simulate balance_of_public -ca last --args accounts:test0 -f test0 | grep "Simulation result:" | awk '{print $3}')
section "Account public balance is ${RESULT}"
assert_eq ${RESULT} "${AMOUNT}n"

source $flows/shared/deploy_sponsored_fpc_and_token.sh
PAYMENT_METHOD="--payment method=fpc-sponsored,fpc=contracts:sponsoredFPC"

section "Deploy with --universal and sponsored fees, without -f (deployer should be 0x0)"
OUTPUT2=$(aztec-wallet deploy counter_contract@Counter --init initialize --args 0 accounts:test0 --universal $PAYMENT_METHOD --salt 0x2)
echo "$OUTPUT2"
DEPLOYER2=$(echo "$OUTPUT2" | grep "Deployer:" | awk '{print $2}')
section "Deployer is ${DEPLOYER2}"
assert_eq "${DEPLOYER2}" "${ZERO_ADDR}"

section "Deploy without --universal (deployer should be sender, not 0x0)"
OUTPUT3=$(aztec-wallet deploy counter_contract@Counter --init initialize --args 0 accounts:test0 -f test0 --salt 0x3)
echo "$OUTPUT3"
DEPLOYER3=$(echo "$OUTPUT3" | grep "Deployer:" | awk '{print $2}')
section "Deployer is ${DEPLOYER3}"
if [ "${DEPLOYER3}" = "${ZERO_ADDR}" ]; then
	err "Deployer should not be 0x0 without --universal"
	exit 1
fi
