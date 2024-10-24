#!/bin/sh
set -eu

alias aztec='node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js'

# Pass the bootnode url as an argument
# Ask the bootnode for l1 contract addresses
output=$(aztec get-node-info -u $1)

echo "$output"

boot_node_enr=$(echo "$output" | grep -oP 'Node ENR: \Kenr:[a-zA-Z0-9\-\_\.]+')
rollup_address=$(echo "$output" | grep -oP 'Rollup Address: \K0x[a-fA-F0-9]{40}')
registry_address=$(echo "$output" | grep -oP 'Registry Address: \K0x[a-fA-F0-9]{40}')
inbox_address=$(echo "$output" | grep -oP 'L1 -> L2 Inbox Address: \K0x[a-fA-F0-9]{40}')
outbox_address=$(echo "$output" | grep -oP 'L2 -> L1 Outbox Address: \K0x[a-fA-F0-9]{40}')
fee_juice_address=$(echo "$output" | grep -oP 'Fee Juice Address: \K0x[a-fA-F0-9]{40}')
fee_juice_portal_address=$(echo "$output" | grep -oP 'Fee Juice Portal Address: \K0x[a-fA-F0-9]{40}')
nomismatokopio_address=$(echo "$output" | grep -oP 'Nomismatokopio Address: \K0x[a-fA-F0-9]{40}')
sysstia_address=$(echo "$output" | grep -oP 'Sysstia Address: \K0x[a-fA-F0-9]{40}')
gerousia_address=$(echo "$output" | grep -oP 'Gerousia Address: \K0x[a-fA-F0-9]{40}')
apella_address=$(echo "$output" | grep -oP 'Apella Address: \K0x[a-fA-F0-9]{40}')
# We assume that there is an env var set for validator keys from the config map
# We get the index in the config map from the pod name, which will have the validator index within it

INDEX=$(echo $POD_NAME | awk -F'-' '{print $NF}')
private_key=$(jq -r ".[$INDEX]" /app/config/keys.json)


# Write the addresses to a file in the shared volume
cat <<EOF > /shared/contracts.env
export BOOTSTRAP_NODES=$boot_node_enr
export ROLLUP_CONTRACT_ADDRESS=$rollup_address
export REGISTRY_CONTRACT_ADDRESS=$registry_address
export INBOX_CONTRACT_ADDRESS=$inbox_address
export OUTBOX_CONTRACT_ADDRESS=$outbox_address
export FEE_JUICE_CONTRACT_ADDRESS=$fee_juice_address
export FEE_JUICE_PORTAL_CONTRACT_ADDRESS=$fee_juice_portal_address
export NOMISMATOKOPIO_CONTRACT_ADDRESS=$nomismatokopio_address
export SYSSTIA_CONTRACT_ADDRESS=$sysstia_address
export GEROUSIA_CONTRACT_ADDRESS=$gerousia_address
export APELLA_CONTRACT_ADDRESS=$apella_address
export VALIDATOR_PRIVATE_KEY=$private_key
export L1_PRIVATE_KEY=$private_key
export SEQ_PUBLISHER_PRIVATE_KEY=$private_key
EOF

cat /shared/contracts.env