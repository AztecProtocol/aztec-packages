#!/bin/bash

export VOTE_AMOUNT=100000000000000000000000
export DEPOSIT_AMOUNT=200000000000000000000000
export SALT=7
export CHAIN_ID=1337
export REGISTRY="0x29f815e32efdef19883cf2b92a766b7aebadd326"
export MY_ADDR="0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"

yarn start deposit-governance-tokens -c $CHAIN_ID -r $REGISTRY --recipient $MY_ADDR -a $DEPOSIT_AMOUNT --mint

yarn start deploy-new-rollup -c $CHAIN_ID -r $REGISTRY --salt $SALT --json --test-accounts

export PAYLOAD="0x5a742b0ec7a01419c7872189c15ababee461afd4"

yarn start propose-with-lock -c $CHAIN_ID -r $REGISTRY --payload-address $PAYLOAD

export PROPOSAL_ID=5

yarn start vote-on-governance-proposal --proposal-id $PROPOSAL_ID --in-favor yea --wait true  -c $CHAIN_ID -r $REGISTRY

yarn start execute-governance-proposal --proposal-id $PROPOSAL_ID --wait true -c $CHAIN_ID -r $REGISTRY
