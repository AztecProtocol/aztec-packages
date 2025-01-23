#!/bin/bash

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)
REPO=$(git rev-parse --show-toplevel)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

# Deploys L1 contracts and captures the output

set -eu

# Check for validator addresses
if [ $# -gt 0 ]; then
  INIT_VALIDATORS="true"
  NUMBER_OF_VALIDATORS="$1"
  # Generate validator keys, this will set the VALIDATOR_ADDRESSES variable
  source $REPO/yarn-project/end-to-end/scripts/native-network/generate-aztec-validator-keys.sh $NUMBER_OF_VALIDATORS
else
  INIT_VALIDATORS="false"
fi

export ETHEREUM_HOST=${ETHEREUM_HOST:-"http://127.0.0.1:8545"}
export L1_CHAIN_ID=${L1_CHAIN_ID:-"31337"}
export PRIVATE_KEY=${PRIVATE_KEY:-""}
export SALT=${SALT:-"1337"}

echo "Waiting for Ethereum node to be up..."
until curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  $ETHEREUM_HOST 2>/dev/null | grep -q 'result'; do
  sleep 1
done
echo "Done waiting."

# Construct base command
COMMAND="node --no-warnings $(git rev-parse --show-toplevel)/yarn-project/aztec/dest/bin/index.js \
  deploy-l1-contracts \
  --rpc-url $ETHEREUM_HOST \
  --l1-chain-id $L1_CHAIN_ID \
  --salt $SALT"

# Add validators if specified
[ "$INIT_VALIDATORS" = "true" ] && COMMAND="$COMMAND --validators $VALIDATOR_ADDRESSES"

# Add private key if provided
[ -n "$PRIVATE_KEY" ] && COMMAND="$COMMAND --private-key $PRIVATE_KEY"

output=$($COMMAND)

echo "$output"

# Extract contract addresses using grep and regex
ROLLUP_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'Rollup Address: \K0x[a-fA-F0-9]{40}')
REGISTRY_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'Registry Address: \K0x[a-fA-F0-9]{40}')
INBOX_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'L1 -> L2 Inbox Address: \K0x[a-fA-F0-9]{40}')
OUTBOX_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'L2 -> L1 Outbox Address: \K0x[a-fA-F0-9]{40}')
FEE_JUICE_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'Fee Juice Address: \K0x[a-fA-F0-9]{40}')
STAKING_ASSET_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'Staking Asset Address: \K0x[a-fA-F0-9]{40}')
FEE_JUICE_PORTAL_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'Fee Juice Portal Address: \K0x[a-fA-F0-9]{40}')
COIN_ISSUER_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'CoinIssuer Address: \K0x[a-fA-F0-9]{40}')
REWARD_DISTRIBUTOR_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'RewardDistributor Address: \K0x[a-fA-F0-9]{40}')
GOVERNANCE_PROPOSER_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'GovernanceProposer Address: \K0x[a-fA-F0-9]{40}')
GOVERNANCE_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'Governance Address: \K0x[a-fA-F0-9]{40}')
SLASH_FACTORY_CONTRACT_ADDRESS=$(echo "$output" | grep -oP 'SlashFactory Address: \K0x[a-fA-F0-9]{40}')

# Save contract addresses to state/l1-contracts.env
cat <<EOCONFIG >$(git rev-parse --show-toplevel)/yarn-project/end-to-end/scripts/native-network/state/l1-contracts.env
export ROLLUP_CONTRACT_ADDRESS=$ROLLUP_CONTRACT_ADDRESS
export REGISTRY_CONTRACT_ADDRESS=$REGISTRY_CONTRACT_ADDRESS
export INBOX_CONTRACT_ADDRESS=$INBOX_CONTRACT_ADDRESS
export OUTBOX_CONTRACT_ADDRESS=$OUTBOX_CONTRACT_ADDRESS
export FEE_JUICE_CONTRACT_ADDRESS=$FEE_JUICE_CONTRACT_ADDRESS
export STAKING_ASSET_CONTRACT_ADDRESS=$STAKING_ASSET_CONTRACT_ADDRESS
export FEE_JUICE_PORTAL_CONTRACT_ADDRESS=$FEE_JUICE_PORTAL_CONTRACT_ADDRESS
export COIN_ISSUER_CONTRACT_ADDRESS=$COIN_ISSUER_CONTRACT_ADDRESS
export REWARD_DISTRIBUTOR_CONTRACT_ADDRESS=$REWARD_DISTRIBUTOR_CONTRACT_ADDRESS
export GOVERNANCE_PROPOSER_CONTRACT_ADDRESS=$GOVERNANCE_PROPOSER_CONTRACT_ADDRESS
export GOVERNANCE_CONTRACT_ADDRESS=$GOVERNANCE_CONTRACT_ADDRESS
export SLASH_FACTORY_CONTRACT_ADDRESS=$SLASH_FACTORY_CONTRACT_ADDRESS
EOCONFIG

echo "Contract addresses saved to state/l1-contracts.env"
