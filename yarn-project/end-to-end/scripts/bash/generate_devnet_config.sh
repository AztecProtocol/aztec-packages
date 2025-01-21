#!/bin/bash
REPO=$(git rev-parse --show-toplevel)

source "$REPO/yarn-project/end-to-end/scripts/bash/read_values_file.sh"

export NUMBER_OF_KEYS=$(read_values_file "validator.replicas")
export NUMBER_OF_KEYS=$(read_values_file "validator.replicas")
export MNEMONIC=$(read_values_file "aztec.l1DeploymentMnemonic")
export BLOCK_TIME=$(read_values_file "ethereum.blockTime")
export GAS_LIMIT=$(read_values_file "ethereum.gasLimit")
export CHAIN_ID=$(read_values_file "ethereum.chainId")

echo "Generating eth devnet config..."
echo "NUMBER_OF_KEYS: $NUMBER_OF_KEYS"
echo "MNEMONIC: $MNEMONIC"
echo "BLOCK_TIME: $BLOCK_TIME"
echo "GAS_LIMIT: $GAS_LIMIT"
echo "CHAIN_ID: $CHAIN_ID"

$REPO/spartan/aztec-network/eth-devnet/create.sh