#!/bin/bash
set -exu

SALT=${1:-$RANDOM}
CHAIN_ID=$2

# Run the deploy-l1-contracts command and capture the output
output=""
MAX_RETRIES=5
RETRY_DELAY=60

for attempt in $(seq 1 $MAX_RETRIES); do
  # Construct base command
  base_cmd="node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js deploy-l1-contracts"

  # Add account - use private key if set, otherwise use mnemonic
  if [ -n "${L1_DEPLOYMENT_PRIVATE_KEY:-}" ]; then
    base_cmd="$base_cmd --private-key $L1_DEPLOYMENT_PRIVATE_KEY"
  else
    base_cmd="$base_cmd --mnemonic '$MNEMONIC'"
  fi

  # Add validators if INIT_VALIDATORS is true
  if [ "${INIT_VALIDATORS:-false}" = "true" ]; then
    output=$(eval $base_cmd --validators $3 --l1-chain-id $CHAIN_ID --salt $SALT) && break
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
rollup_address=$(echo "$output" | grep -oP 'Rollup Address: \K0x[a-fA-F0-9]{40}')
registry_address=$(echo "$output" | grep -oP 'Registry Address: \K0x[a-fA-F0-9]{40}')
inbox_address=$(echo "$output" | grep -oP 'L1 -> L2 Inbox Address: \K0x[a-fA-F0-9]{40}')
outbox_address=$(echo "$output" | grep -oP 'L2 -> L1 Outbox Address: \K0x[a-fA-F0-9]{40}')
fee_juice_address=$(echo "$output" | grep -oP 'Fee Juice Address: \K0x[a-fA-F0-9]{40}')
staking_asset_address=$(echo "$output" | grep -oP 'Staking Asset Address: \K0x[a-fA-F0-9]{40}')
fee_juice_portal_address=$(echo "$output" | grep -oP 'Fee Juice Portal Address: \K0x[a-fA-F0-9]{40}')
coin_issuer_address=$(echo "$output" | grep -oP 'CoinIssuer Address: \K0x[a-fA-F0-9]{40}')
reward_distributor_address=$(echo "$output" | grep -oP 'RewardDistributor Address: \K0x[a-fA-F0-9]{40}')
governance_proposer_address=$(echo "$output" | grep -oP 'GovernanceProposer Address: \K0x[a-fA-F0-9]{40}')
governance_address=$(echo "$output" | grep -oP 'Governance Address: \K0x[a-fA-F0-9]{40}')
slash_factory_address=$(echo "$output" | grep -oP 'SlashFactory Address: \K0x[a-fA-F0-9]{40}')

# Write the addresses to a file in the shared volume
cat <<EOF >/shared/contracts/contracts.env
export ROLLUP_CONTRACT_ADDRESS=$rollup_address
export REGISTRY_CONTRACT_ADDRESS=$registry_address
export INBOX_CONTRACT_ADDRESS=$inbox_address
export OUTBOX_CONTRACT_ADDRESS=$outbox_address
export FEE_JUICE_CONTRACT_ADDRESS=$fee_juice_address
export STAKING_ASSET_CONTRACT_ADDRESS=$staking_asset_address
export FEE_JUICE_PORTAL_CONTRACT_ADDRESS=$fee_juice_portal_address
export COIN_ISSUER_CONTRACT_ADDRESS=$coin_issuer_address
export REWARD_DISTRIBUTOR_CONTRACT_ADDRESS=$reward_distributor_address
export GOVERNANCE_PROPOSER_CONTRACT_ADDRESS=$governance_proposer_address
export GOVERNANCE_CONTRACT_ADDRESS=$governance_address
export SLASH_FACTORY_CONTRACT_ADDRESS=$slash_factory_address
EOF

cat /shared/contracts/contracts.env
