#!/bin/bash
set -exu

CHAIN_ID=$1


# Use default account, it is funded on our dev machine
export PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Run the deploy-l1-contracts command and capture the output
output=""
# if INIT_VALIDATORS is true, then we need to pass the validators flag to the deploy-l1-contracts command
if [ "$INIT_VALIDATORS" = "true" ]; then
  output=$(node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js deploy-l1-contracts --validators $2 --l1-chain-id $CHAIN_ID)
else
  output=$(node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js deploy-l1-contracts --l1-chain-id $CHAIN_ID)
fi

echo "$output"

# Extract contract addresses using grep and regex
rollup_address=$(echo "$output" | grep -oP 'Rollup Address: \K0x[a-fA-F0-9]{40}')
registry_address=$(echo "$output" | grep -oP 'Registry Address: \K0x[a-fA-F0-9]{40}')
inbox_address=$(echo "$output" | grep -oP 'L1 -> L2 Inbox Address: \K0x[a-fA-F0-9]{40}')
outbox_address=$(echo "$output" | grep -oP 'L2 -> L1 Outbox Address: \K0x[a-fA-F0-9]{40}')
fee_juice_address=$(echo "$output" | grep -oP 'Fee Juice Address: \K0x[a-fA-F0-9]{40}')
fee_juice_portal_address=$(echo "$output" | grep -oP 'Fee Juice Portal Address: \K0x[a-fA-F0-9]{40}')
coin_issuer_address=$(echo "$output" | grep -oP 'CoinIssuer Address: \K0x[a-fA-F0-9]{40}')
reward_distributor_address=$(echo "$output" | grep -oP 'RewardDistributor Address: \K0x[a-fA-F0-9]{40}')
governance_proposer_address=$(echo "$output" | grep -oP 'GovernanceProposer Address: \K0x[a-fA-F0-9]{40}')
governance_address=$(echo "$output" | grep -oP 'Governance Address: \K0x[a-fA-F0-9]{40}')

# Write the addresses to a file in the shared volume
cat <<EOF > /shared/contracts/contracts.env
export ROLLUP_CONTRACT_ADDRESS=$rollup_address
export REGISTRY_CONTRACT_ADDRESS=$registry_address
export INBOX_CONTRACT_ADDRESS=$inbox_address
export OUTBOX_CONTRACT_ADDRESS=$outbox_address
export FEE_JUICE_CONTRACT_ADDRESS=$fee_juice_address
export FEE_JUICE_PORTAL_CONTRACT_ADDRESS=$fee_juice_portal_address
export COIN_ISSUER_CONTRACT_ADDRESS=$coin_issuer_address
export REWARD_DISTRIBUTOR_CONTRACT_ADDRESS=$reward_distributor_address
export GOVERNANCE_PROPOSER_CONTRACT_ADDRESS=$governance_proposer_address
export GOVERNANCE_CONTRACT_ADDRESS=$governance_address
EOF

cat /shared/contracts/contracts.env
