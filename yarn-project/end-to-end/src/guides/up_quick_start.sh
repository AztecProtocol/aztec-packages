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

# docs:start:declare-accounts
aztec-wallet create-account -a alice
aztec-wallet create-account -a bob
# docs:end:declare-accounts

# docs:start:deploy
DEPLOY_OUTPUT=$(aztec-wallet deploy ../noir-contracts.js/artifacts/token_contract-Token.json --args accounts:alice Test TST 18 -f alice)
TOKEN_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE 'Contract deployed at 0x[0-9a-fA-F]+' | cut -d ' ' -f4)
echo "Deployed contract at $TOKEN_ADDRESS"
# docs:end:deploy

# docs:start:mint-private
MINT_AMOUNT=69
aztec-wallet send mint_to_private -ca last --args accounts:alice accounts:alice $MINT_AMOUNT -f alice
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

aztec-wallet send transfer -ca last --args accounts:bob $TRANSFER_AMOUNT -f alice
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
