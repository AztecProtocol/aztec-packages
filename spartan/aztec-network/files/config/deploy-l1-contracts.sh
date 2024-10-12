#!/bin/sh
set -exu

alias aztec='node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js'

# Run the deploy-l1-contracts command and capture the output
output=""
# if INIT_VALIDATORS is true, then we need to pass the validators flag to the deploy-l1-contracts command
if [ "$INIT_VALIDATORS" = "true" ]; then
  output=$(aztec deploy-l1-contracts --validators $1)
else
  output=$(aztec deploy-l1-contracts)
fi

echo "$output"

# Extract contract addresses using grep and regex
rollup_address=$(echo "$output" | grep -oP 'Rollup Address: \K0x[a-fA-F0-9]{40}')
registry_address=$(echo "$output" | grep -oP 'Registry Address: \K0x[a-fA-F0-9]{40}')
inbox_address=$(echo "$output" | grep -oP 'L1 -> L2 Inbox Address: \K0x[a-fA-F0-9]{40}')
outbox_address=$(echo "$output" | grep -oP 'L2 -> L1 Outbox Address: \K0x[a-fA-F0-9]{40}')
fee_juice_address=$(echo "$output" | grep -oP 'Fee Juice Address: \K0x[a-fA-F0-9]{40}')
fee_juice_portal_address=$(echo "$output" | grep -oP 'Fee Juice Portal Address: \K0x[a-fA-F0-9]{40}')

# Write the addresses to a file in the shared volume
cat <<EOF > /shared/contracts.env
export ROLLUP_CONTRACT_ADDRESS=$rollup_address
export REGISTRY_CONTRACT_ADDRESS=$registry_address
export INBOX_CONTRACT_ADDRESS=$inbox_address
export OUTBOX_CONTRACT_ADDRESS=$outbox_address
export FEE_JUICE_CONTRACT_ADDRESS=$fee_juice_address
export FEE_JUICE_PORTAL_CONTRACT_ADDRESS=$fee_juice_portal_address
EOF

cat /shared/contracts.env
