#!/bin/bash

# Deploys L1 contracts and captures the output

set -eu

echo "Waiting for Anvil to be up at port 8545..."
until curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://127.0.0.1:8545 2>/dev/null | grep -q 'result' ; do
  sleep 1
done

# Run the deploy-l1-contracts command and capture the output
export ETHEREUM_HOST="http://127.0.0.1:8545"
output=$(node --no-warnings $(git rev-parse --show-toplevel)/yarn-project/aztec/dest/bin/index.js deploy-l1-contracts)

echo "$output"

# Extract contract addresses using grep and regex
ROLLUP_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'Rollup Address: \K0x[a-fA-F0-9]{40}')
REGISTRY_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'Registry Address: \K0x[a-fA-F0-9]{40}')
INBOX_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'L1 -> L2 Inbox Address: \K0x[a-fA-F0-9]{40}')
OUTBOX_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'L2 -> L1 Outbox Address: \K0x[a-fA-F0-9]{40}')
FEE_JUICE_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'Fee Juice Address: \K0x[a-fA-F0-9]{40}')
FEE_JUICE_PORTAL_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'Fee Juice Portal Address: \K0x[a-fA-F0-9]{40}')

# Save contract addresses to l1-contracts.env
cat << EOCONFIG > $(git rev-parse --show-toplevel)/yarn-project/end-to-end/scripts/native-network/l1-contracts.env
export ROLLUP_CONTRACT_ADDRESS=$ROLLUP_CONTRACT_ADDRESS
export REGISTRY_CONTRACT_ADDRESS=$REGISTRY_CONTRACT_ADDRESS
export INBOX_CONTRACT_ADDRESS=$INBOX_CONTRACT_ADDRESS
export OUTBOX_CONTRACT_ADDRESS=$OUTBOX_CONTRACT_ADDRESS
export FEE_JUICE_CONTRACT_ADDRESS=$FEE_JUICE_CONTRACT_ADDRESS
export FEE_JUICE_PORTAL_CONTRACT_ADDRESS=$FEE_JUICE_PORTAL_CONTRACT_ADDRESS
EOCONFIG

echo "Contract addresses saved to l1-contracts.env"
