#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

# This test exercises the kernelless simulation feature in the CLI wallet, running an add_liquidity call for the AMM contract
# WITHOUT providing the usually required authwits. There are no assertions on this test because the usual simulation
# behaviour would be for it to fail. Here we use a simulated account contract which doesn't perform authwit checks
# and thus it finishes successfully. Finally, it prints the expected authorizations in a human-readable format.

test_title "Capture authwits flow"

export INITIAL_AMOUNT=1000000000

aztec-wallet import-test-accounts
aztec-wallet deploy Token --args accounts:test0 Token0 TST0 18 -f test0 -a token0 -p none
aztec-wallet deploy Token --args accounts:test0 Token1 TST0 18 -f test0 -a token1 -p none
aztec-wallet deploy Token --args accounts:test0 Liquidity LIQ 18 -f test0 -a liquidity -p none

aztec-wallet deploy AMM --args contracts:token0 contracts:token1 contracts:liquidity -f test0 -a amm -p none
aztec-wallet send set_minter -ca contracts:liquidity --args contracts:amm true -f test0 -p none

aztec-wallet send mint_to_private -ca contracts:token0 --args accounts:test1 $INITIAL_AMOUNT -f test0 -p none
aztec-wallet send mint_to_private -ca contracts:token1 --args accounts:test1 $INITIAL_AMOUNT -f test0 -p none

aztec-wallet create-secret -a add-liquidity-nonce

export AMOUNT_0_MAX=$((INITIAL_AMOUNT/2))
export AMOUNT_1_MAX=$((INITIAL_AMOUNT/2))
export AMOUNT_0_MIN=1
export AMOUNT_1_MIN=1

aztec-wallet simulate add_liquidity -ca contracts:amm --args $AMOUNT_0_MAX $AMOUNT_1_MAX $AMOUNT_0_MIN $AMOUNT_1_MIN secrets:add-liquidity-nonce -f accounts:test1 -v
