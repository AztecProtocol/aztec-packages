#!/usr/bin/env bash
set -exu

# If REGISTRY_CONTRACT_ADDRESS is already set, skip deployment and just write the file
if [ -n "${REGISTRY_CONTRACT_ADDRESS:-}" ]; then
  # make sure that the fee asset handler address is set
  if [ -z "${FEE_ASSET_HANDLER_CONTRACT_ADDRESS:-}" ]; then
    echo "Registry address is already set, but FeeAssetHandler address is not set. Exiting."
    exit 1
  fi
  # make sure the slash factory address is set
  if [ -z "${SLASH_FACTORY_CONTRACT_ADDRESS:-}" ]; then
    echo "Registry address is already set, but SlashFactory address is not set. Exiting."
    exit 1
  fi

  echo "Registry address already set. Skipping deployment."
  # Write the addresses to a file in the shared volume
  cat <<EOF >/shared/contracts/contracts.env
export REGISTRY_CONTRACT_ADDRESS=$REGISTRY_CONTRACT_ADDRESS
export SLASH_FACTORY_CONTRACT_ADDRESS=$SLASH_FACTORY_CONTRACT_ADDRESS
export FEE_ASSET_HANDLER_CONTRACT_ADDRESS=$FEE_ASSET_HANDLER_CONTRACT_ADDRESS
EOF
  cat /shared/contracts/contracts.env
  exit 0
fi

SALT=${1:-$RANDOM}
CHAIN_ID=$2
VALIDATOR_ADDRESSES=$3

# If the chain ID is 11155111 or 1, we are deploying to a public network, make sure that we do not use accelerated test deployments
PUBLIC_CHAIN_ID=false
if [ "$CHAIN_ID" = "11155111" -o "$CHAIN_ID" = "1" ]; then
  PUBLIC_CHAIN_ID=true
fi

# Overwrite the value of ACCELERATED_TEST_DEPLOYMENTS env variable if we are deploying to a public network
if [ "$PUBLIC_CHAIN_ID" = "true" ]; then
  ACCELERATED_TEST_DEPLOYMENTS=false
fi

# Run the deploy-l1-contracts command and capture the output
output=""
MAX_RETRIES=5
RETRY_DELAY=15

TEST_ACCOUNTS=${TEST_ACCOUNTS:-false}
TEST_ACCOUNTS_ARG=""
if [ "$TEST_ACCOUNTS" = "true" ]; then
  TEST_ACCOUNTS_ARG="--test-accounts"
fi

SPONSORED_FPC=${SPONSORED_FPC:-false}
SPONSORED_FPC_ARG=""
if [ "$SPONSORED_FPC" = "true" ]; then
  SPONSORED_FPC_ARG="--sponsored-fpc"
fi

ACCELERATED_TEST_DEPLOYMENTS_ARG=""
if [ "$ACCELERATED_TEST_DEPLOYMENTS" = "true" ]; then
  ACCELERATED_TEST_DEPLOYMENTS_ARG="--accelerated-test-deployments"
fi

for attempt in $(seq 1 $MAX_RETRIES); do
  # Construct base command
  base_cmd="LOG_LEVEL=debug node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js deploy-l1-contracts $TEST_ACCOUNTS_ARG $ACCELERATED_TEST_DEPLOYMENTS_ARG $SPONSORED_FPC_ARG"

  # Add account - use private key if set, otherwise use mnemonic
  if [ -n "${L1_DEPLOYMENT_PRIVATE_KEY:-}" ]; then
    base_cmd="$base_cmd --private-key $L1_DEPLOYMENT_PRIVATE_KEY"
  else
    base_cmd="$base_cmd --mnemonic '$MNEMONIC'"
  fi

  # Add validators if INIT_VALIDATORS is true
  if [ "${INIT_VALIDATORS:-false}" = "true" ]; then
    base_cmd="$base_cmd --validators $VALIDATOR_ADDRESSES"
  fi

  output=$(eval $base_cmd --l1-chain-id $CHAIN_ID --salt $SALT) && break

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
fee_asset_handler_address=$(echo "$output" | grep -oP 'FeeAssetHandler Address: \K0x[a-fA-F0-9]{40}')
# Write the addresses to a file in the shared volume
cat <<EOF >/shared/contracts/contracts.env
export REGISTRY_CONTRACT_ADDRESS=$registry_address
export SLASH_FACTORY_CONTRACT_ADDRESS=$slash_factory_address
export FEE_ASSET_HANDLER_CONTRACT_ADDRESS=$fee_asset_handler_address
EOF

cat /shared/contracts/contracts.env
