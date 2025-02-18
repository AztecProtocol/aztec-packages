#!/bin/bash
# Run locally from end-to-end folder while running anvil and sandbox with:
# PATH=$PATH:../node_modules/.bin ./src/guides/up_quick_start.sh
set -eux

export WALLET_DATA_DIRECTORY=$(mktemp -d)/up_quick_start

function on_exit {
  echo "Cleaning up $WALLET_DATA_DIRECTORY..."
  rm -rf $WALLET_DATA_DIRECTORY
}
trap on_exit EXIT

aztec-wallet() {
  node --no-warnings ../cli-wallet/dest/bin/index.js "$@"
}

aztec-wallet import-test-accounts

# docs:start:declare-accounts
aztec-wallet create-account -a alice --payment method=fee_juice,feePayer=test0
aztec-wallet create-account -a bob --payment method=fee_juice,feePayer=test0
# docs:end:declare-accounts

# docs:start:deploy
DEPLOY_OUTPUT=$(aztec-wallet deploy ../noir-contracts.js/artifacts/token_contract-Token.json --args accounts:test0 Test TST 18 -f test0)
TOKEN_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE 'Contract deployed at 0x[0-9a-fA-F]+' | cut -d ' ' -f4)
echo "Deployed contract at $TOKEN_ADDRESS"
# docs:end:deploy

# docs:start:mint-private
MINT_AMOUNT=69
aztec-wallet send mint_to_private -ca last --args accounts:test0 accounts:alice $MINT_AMOUNT -f test0
# docs:end:mint-private

# docs:start:get-balance
ALICE_BALANCE=$(aztec-wallet simulate balance_of_private -ca last --args accounts:alice -f alice)
if ! echo $ALICE_BALANCE | grep -q $MINT_AMOUNT; then
  echo "Incorrect Alice balance after transaction (expected $MINT_AMOUNT but got $ALICE_BALANCE)"
  exit 1
fi
# docs:end:get-balance

# docs:start:transfer
TRANSFER_AMOUNT=42

aztec-wallet create-authwit transfer_in_private accounts:test0 -ca last --args accounts:alice accounts:bob $TRANSFER_AMOUNT 1 -f alice
aztec-wallet add-authwit authwits:last alice -f test0

aztec-wallet send transfer_in_private -ca last --args accounts:alice accounts:bob $TRANSFER_AMOUNT 1 -f test0
# docs:end:transfer

# Test end result
ALICE_BALANCE=$(aztec-wallet simulate balance_of_private -ca last --args accounts:alice -f alice)
if ! echo $ALICE_BALANCE | grep -q "$(($MINT_AMOUNT - $TRANSFER_AMOUNT))"; then
  echo "Incorrect Alice balance after transaction (expected 27 but got $ALICE_BALANCE)"
  exit 1
fi

BOB_BALANCE=$(aztec-wallet simulate balance_of_private -ca last --args accounts:bob -f bob)
if ! echo $BOB_BALANCE | grep -q $TRANSFER_AMOUNT; then
  echo "Incorrect Bob balance after transaction (expected $TRANSFER_AMOUNT but got $BOB_BALANCE)"
  exit 1
fi
