#!/bin/bash

set -euo pipefail

DIR_PATH=$(git rev-parse --show-toplevel)/spartan/aztec-network/eth-devnet

## Genesis configuration values are provided as environment variables
NUMBER_OF_KEYS=${NUMBER_OF_KEYS:-16}
MNEMONIC=${MNEMONIC:-"test test test test test test test test test test test junk"}
BLOCK_TIME=${BLOCK_TIME:-"12"}
GAS_LIMIT=${GAS_LIMIT:-"1000000000"}
CHAIN_ID=${CHAIN_ID:-"1337"}

# Install cast if it is not installed
if ! command -v cast &> /dev/null; then
  curl -L https://foundry.paradigm.xyz | bash
  ~/.foundry/bin/foundryup
fi

# Function to create execution genesis
# Updates genesis timestamp to current time, helps with triggering Consensus layer
create_execution_genesis() {
  local execution_genesis_path="$1"
  local execution_genesis_output="$2"
  echo "Creating execution genesis..."

  # Get the current timestamp
  timestamp=$(date +%s)

  # Read the Genesis JSON template
  if [[ ! -f "$execution_genesis_path" ]]; then
    echo "Error: Genesis template not found at $execution_genesis_path"
    exit 1
  fi

  genesis_json=$(cat "$execution_genesis_path")

  # Replace the timestamp in the Genesis JSON
  updated_json=$(echo "$genesis_json" | jq --arg ts "$timestamp" '.timestamp = ($ts | tonumber)')

  # If mnemonic is provided, add prefunded accounts
  if [[ -n "${MNEMONIC:-}" ]]; then
    echo "Prefunding accounts with mnemonic: $MNEMONIC"
    echo "Number of keys: $NUMBER_OF_KEYS"

    updated_json=$(prefund_accounts "$updated_json" "$MNEMONIC" "$NUMBER_OF_KEYS")
  fi

  # Update the gas limit to the configured value
  if [[ -n "${GAS_LIMIT:-}" ]]; then
    updated_json=$(echo "$updated_json" | jq --arg gas_limit "$GAS_LIMIT" '.gasLimit = ($gas_limit | tonumber)')
  fi

  if [[ -n "${CHAIN_ID:-}" ]]; then
    updated_json=$(echo "$updated_json" | jq --arg chain_id "$CHAIN_ID" '.config.chainId = ($chain_id | tonumber)')
  fi

  # Write the updated Genesis JSON to the output file
  echo "$updated_json" > "$execution_genesis_output"
  echo "Execution genesis created at $execution_genesis_output"
}

prefund_accounts() {
  local genesis_json="$1"
  local mnemonic="$2"
  local number_of_keys="$3"
  local updated_json="$genesis_json"

  # Initialize array to store addresses
  declare -a VALIDATOR_ADDRESSES_LIST

  # Generate addresses from mnemonic
  for i in $(seq 0 $(($number_of_keys - 1))); do
    # Get private key and address
    PRIVATE_KEY=$(cast wallet private-key "$MNEMONIC" --mnemonic-index $i)
    ADDRESS=$(cast wallet address "$PRIVATE_KEY")
    VALIDATOR_ADDRESSES_LIST+=("$ADDRESS")
  done

  # Add each address to the genesis allocation
  for address in "${VALIDATOR_ADDRESSES_LIST[@]}"; do
    updated_json=$(echo "$updated_json" | jq --arg addr "$address" \
      '.alloc[$addr] = {"balance": "1000000000000000000000000000"}')
  done

  echo "$updated_json"
}

# Function to create beacon genesis
# Uses the eth2-testnet-generator to generate beacon genesis state (genesis.ssz file)
# The selected eth1 block
create_beacon_genesis() {
  local execution_genesis_path="$1"
  local beacon_mnemonics_path="./config/mnemonics.yaml"
  local beacon_config_path="./config/config.yaml"
  local beacon_genesis_path="./out"

  echo "Creating beacon genesis using:"
  echo "  Beacon mnemonics path: $beacon_mnemonics_path"
  echo "  Beacon config path: $beacon_config_path"
  echo "  Execution genesis path: $execution_genesis_path"

  # update the templates block time if it is provided
  cp "$DIR_PATH/$beacon_config_path" "$DIR_PATH/out/config.yaml"
  if [[ -n "${BLOCK_TIME:-}" ]]; then
    yq eval ".SECONDS_PER_SLOT = ${BLOCK_TIME}" -i "$DIR_PATH/out/config.yaml"
    yq eval ".SECONDS_PER_ETH1_BLOCK = ${BLOCK_TIME}" -i "$DIR_PATH/out/config.yaml"
  fi

  # Update the chain id if it is provided
  if [[ -n "${CHAIN_ID:-}" ]]; then
    yq eval ".DEPOSIT_CHAIN_ID = ${CHAIN_ID}" -i "$DIR_PATH/out/config.yaml"
    yq eval ".DEPOSIT_NETWORK_ID = ${CHAIN_ID}" -i "$DIR_PATH/out/config.yaml"
  fi

  # Run the protolamba's eth2 testnet genesis container
  echo "$DIR_PATH/config:/app/config"
  echo "$DIR_PATH/out:/app/out"

  docker run --rm \
    -v "$DIR_PATH/config:/app/config" \
    -v "$DIR_PATH/out:/app/out" \
    maddiaa/eth2-testnet-genesis deneb \
      --config="./out/config.yaml" \
      --preset-phase0=minimal \
      --preset-altair=minimal \
      --preset-bellatrix=minimal \
      --preset-capella=minimal \
      --preset-deneb=minimal \
      --eth1-config="./out/genesis.json" \
      --state-output="${beacon_genesis_path}/genesis.ssz" \
      --tranches-dir="$beacon_genesis_path" \
      --mnemonics="$beacon_mnemonics_path" \
      --eth1-withdrawal-address="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
      --eth1-match-genesis-time

  if [[ $? -ne 0 ]]; then
    echo "Error: eth2-testnet-genesis failed."
    exit 1
  fi

  echo "Beacon genesis created at $beacon_genesis_path"
}

create_deposit_contract_block() {
  echo 0 > "$DIR_PATH/out/deposit_contract_block.txt"
  echo "Deposit contract block created at $DIR_PATH/out/deposit_contract_block.txt"
}

## The ssz file must be written in base64 in order for a config map to accept it
write_ssz_file_base64() {
  local ssz_file="$DIR_PATH/out/genesis.ssz"
  local output_file="$DIR_PATH/out/genesis-ssz"
  base64 -w 0 "$ssz_file" > "$output_file"
  echo "SSZ file base64 encoded at $output_file"
}

# Main
beacon_config_path="$DIR_PATH/config/config.yaml"
genesis_json_path="$DIR_PATH/config/genesis.json"

mkdir -p "$DIR_PATH/out"

create_execution_genesis "$DIR_PATH/config/genesis.json" "$DIR_PATH/out/genesis.json"
create_beacon_genesis "$DIR_PATH/out/genesis.json"
create_deposit_contract_block
write_ssz_file_base64

cp "$beacon_config_path" "$DIR_PATH/out/config.yaml"
cp "$DIR_PATH/config/jwt-secret.hex" "$DIR_PATH/out/jwt-secret.hex"
echo "Genesis files copied to ./out"
