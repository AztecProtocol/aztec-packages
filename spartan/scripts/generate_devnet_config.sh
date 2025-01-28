#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source

values_file="$1"
value_yamls="../aztec-network/values/$values_file ../aztec-network/values.yaml"

export NUMBER_OF_KEYS=$(./read_value.sh "validator.replicas" $value_yamls)
export EXTRA_ACCOUNTS=$(./read_value.sh "ethereum.extraAccounts" $value_yamls)
export MNEMONIC=${MNEMONIC:-$(./read_value.sh "aztec.l1DeploymentMnemonic" $value_yamls)}
export BLOCK_TIME=$(./read_value.sh "ethereum.blockTime" $value_yamls)
export GAS_LIMIT=$(./read_value.sh "ethereum.gasLimit" $value_yamls)
export CHAIN_ID=$(./read_value.sh "ethereum.chainId" $value_yamls)

echo "Generating eth devnet config..."
NUMBER_OF_KEYS=$((NUMBER_OF_KEYS + EXTRA_ACCOUNTS))
echo "NUMBER_OF_KEYS: $NUMBER_OF_KEYS"
echo "MNEMONIC: $MNEMONIC"
echo "BLOCK_TIME: $BLOCK_TIME"
echo "GAS_LIMIT: $GAS_LIMIT"
echo "CHAIN_ID: $CHAIN_ID"

../aztec-network/eth-devnet/create.sh