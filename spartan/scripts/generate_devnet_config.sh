#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

values_file="$1"
value_yamls="../aztec-network/values/$values_file ../aztec-network/values.yaml"

export NUMBER_OF_DEFAULT_ACCOUNTS=$(./read_value.sh "aztec.numberOfDefaultAccounts" $value_yamls)

export VALIDATOR_REPLICAS=$(./read_value.sh "validator.replicas" $value_yamls)
export VALIDATOR_KEYS_PER_NODE=$(./read_value.sh "validator.keysPerNode" $value_yamls)
export NUMBER_OF_VALIDATOR_KEYS=$((VALIDATOR_REPLICAS * VALIDATOR_KEYS_PER_NODE))
export VALIDATOR_KEY_START_INDEX=$(./read_value.sh "aztec.validatorKeyIndexStart" $value_yamls)

export EXTRA_ACCOUNTS=$(./read_value.sh "aztec.extraAccounts" $value_yamls)
export EXTRA_ACCOUNTS_START_INDEX=$(./read_value.sh "aztec.extraAccountsStartIndex" $value_yamls)

export NUMBER_OF_PROVER_KEYS=$(./read_value.sh "proverNode.replicas" $value_yamls)
export PROVER_KEY_START_INDEX=$(./read_value.sh "aztec.proverKeyIndexStart" $value_yamls)

export NUMBER_OF_BOT_KEYS=$(./read_value.sh "bot.replicas" $value_yamls)
export BOT_KEY_START_INDEX=$(./read_value.sh "aztec.botKeyIndexStart" $value_yamls)

export MNEMONIC=${MNEMONIC:-$(./read_value.sh "aztec.l1DeploymentMnemonic" $value_yamls)}
export BLOCK_TIME=$(./read_value.sh "ethereum.blockTime" $value_yamls)
export GAS_LIMIT=$(./read_value.sh "ethereum.gasLimit" $value_yamls)
export CHAIN_ID=$(./read_value.sh "ethereum.chainId" $value_yamls)

# Initialize arrays for each type of key indices
DEFAULT_ACCOUNTS_INDICES=$(seq 0 $((NUMBER_OF_DEFAULT_ACCOUNTS - 1)))
VALIDATOR_KEY_INDICES=$(seq $VALIDATOR_KEY_START_INDEX $((VALIDATOR_KEY_START_INDEX + NUMBER_OF_VALIDATOR_KEYS - 1)))
EXTRA_ACCOUNTS_INDICES=$(seq $EXTRA_ACCOUNTS_START_INDEX $((EXTRA_ACCOUNTS_START_INDEX + EXTRA_ACCOUNTS - 1)))
PROVER_KEY_INDICES=$(seq $PROVER_KEY_START_INDEX $((PROVER_KEY_START_INDEX + NUMBER_OF_PROVER_KEYS - 1)))
BOT_KEY_INDICES=$(seq $BOT_KEY_START_INDEX $((BOT_KEY_START_INDEX + NUMBER_OF_BOT_KEYS - 1)))

# Combine all indices, filter out empty items, sort, and format
export PREFUNDED_MNEMONIC_INDICES=$(echo "$DEFAULT_ACCOUNTS_INDICES $VALIDATOR_KEY_INDICES $EXTRA_ACCOUNTS_INDICES $PROVER_KEY_INDICES $BOT_KEY_INDICES" | tr ' ' '\n' | grep -v '^$' | sort -u | tr '\n' ',' | sed 's/,$//')

echo "Generating eth devnet config..."
echo "VALIDATOR_REPLICAS: $VALIDATOR_REPLICAS"
echo "VALIDATOR_KEYS_PER_NODE: $VALIDATOR_KEYS_PER_NODE"
echo "TOTAL_VALIDATOR_KEYS: $NUMBER_OF_VALIDATOR_KEYS"
echo "PREFUNDED_MNEMONIC_INDICES: $PREFUNDED_MNEMONIC_INDICES"
echo "MNEMONIC: $(echo $MNEMONIC | cut -d' ' -f1-2)..."
echo "BLOCK_TIME: $BLOCK_TIME"
echo "GAS_LIMIT: $GAS_LIMIT"
echo "CHAIN_ID: $CHAIN_ID"

../aztec-network/eth-devnet/create.sh
