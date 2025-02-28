#!/bin/bash
set -exu

# If REGISTRY_CONTRACT_ADDRESS is already set, skip deployment and just write the file
if [ -n "${REGISTRY_CONTRACT_ADDRESS:-}" ]; then
  echo "Registry address already set. Skipping deployment."
  # Write the addresses to a file in the shared volume
  cat <<EOF >/shared/contracts/contracts.env
export REGISTRY_CONTRACT_ADDRESS=$REGISTRY_CONTRACT_ADDRESS
EOF
  cat /shared/contracts/contracts.env
  exit 0
fi

SALT=${1:-$RANDOM}
CHAIN_ID=$2
VALIDATOR_ADDRESSES=$3

# Run the deploy-l1-contracts command and capture the output
output=""
MAX_RETRIES=5
RETRY_DELAY=15
TEST_ACCOUNTS=${TEST_ACCOUNTS:-false}
TEST_ACCOUNTS_ARG=""
if [ "$TEST_ACCOUNTS" = "true" ]; then
  TEST_ACCOUNTS_ARG="--test-accounts"
fi

for attempt in $(seq 1 $MAX_RETRIES); do
  # Construct base command
  base_cmd="LOG_LEVEL=debug node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js deploy-l1-contracts $TEST_ACCOUNTS_ARG"

  # Add account - use private key if set, otherwise use mnemonic
  if [ -n "${L1_DEPLOYMENT_PRIVATE_KEY:-}" ]; then
    base_cmd="$base_cmd --private-key $L1_DEPLOYMENT_PRIVATE_KEY"
  else
    base_cmd="$base_cmd --mnemonic '$MNEMONIC'"
  fi

  # Add validators if INIT_VALIDATORS is true
  if [ "${INIT_VALIDATORS:-false}" = "true" ]; then
    output=$(eval $base_cmd --validators $VALIDATOR_ADDRESSES --l1-chain-id $CHAIN_ID --salt $SALT) && break
  else
    output=$(eval $base_cmd --l1-chain-id $CHAIN_ID --salt $SALT) && break
  fi

  echo "Attempt $attempt failed. Retrying in $RETRY_DELAY seconds..."
  sleep "$RETRY_DELAY"
done || {
  echo "All l1 contract deploy attempts failed."
  exit 1
}

echo "$output"

# Extract contract addresses using grep and regex
registry_address=$(echo "$output" | grep -oP 'Registry Address: \K0x[a-fA-F0-9]{40}')
slash_factory_address=$(echo "$output" | grep -oP 'SlashFactory Address: \K0x[a-fA-F0-9]{40}')

# Write the addresses to a file in the shared volume
cat <<EOF >/shared/contracts/contracts.env
export REGISTRY_CONTRACT_ADDRESS=$registry_address
export SLASH_FACTORY_CONTRACT_ADDRESS=$slash_factory_address
EOF

cat /shared/contracts/contracts.env
