#!/bin/bash
set -eu

# Pass a PXE url as an argument
# Ask the PXE's node for l1 contract addresses
output=$(node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js get-node-info -u $1)

echo "$output"

boot_node_enr=$(echo "$output" | grep -oP 'Node ENR: \Kenr:[a-zA-Z0-9\-\_\.]+')
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
# We assume that there is an env var set for validator keys from the config map
# We get the index in the config map from the pod name, which will have the validator index within it

INDEX=$(echo $POD_NAME | awk -F'-' '{print $NF}')
private_key=$(jq -r ".[$INDEX]" /app/config/keys.json)

# Write the addresses to a file in the shared volume
cat <<EOF >/shared/contracts/contracts.env
export BOOTSTRAP_NODES=$boot_node_enr
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
export VALIDATOR_PRIVATE_KEY=$private_key
export L1_PRIVATE_KEY=$private_key
export SEQ_PUBLISHER_PRIVATE_KEY=$private_key
EOF

cat /shared/contracts/contracts.env
