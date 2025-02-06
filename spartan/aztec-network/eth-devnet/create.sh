#!/bin/bash

set -euo pipefail

DIR_PATH=$(git rev-parse --show-toplevel)/spartan/aztec-network/eth-devnet

## Genesis configuration values are provided as environment variables
PREFUNDED_MNEMONIC_INDICES=${PREFUNDED_MNEMONIC_INDICES:-"0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,1000,1001,1002,1003"}
MNEMONIC=${MNEMONIC:-"test test test test test test test test test test test junk"}
BLOCK_TIME=${BLOCK_TIME:-"12"}
GAS_LIMIT=${GAS_LIMIT:-"1000000000"}
CHAIN_ID=${CHAIN_ID:-"1337"}
XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-"$HOME/.config"}

# Install cast if it is not installed
if ! command -v cast &> /dev/null; then
  curl -L https://foundry.paradigm.xyz | bash
  ## add cast to path
  $HOME/.foundry/bin/foundryup && export PATH="$PATH:$HOME/.foundry/bin" || $XDG_CONFIG_HOME/.foundry/bin/foundryup && export PATH="$PATH:$XDG_CONFIG_HOME/.foundry/bin"
fi

# Function to create execution genesis
# Updates genesis timestamp to current time, helps with triggering Consensus layer
function create_execution_genesis {
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
    echo "Key indices: $PREFUNDED_MNEMONIC_INDICES"

    updated_json=$(prefund_accounts "$updated_json" "$MNEMONIC" "$PREFUNDED_MNEMONIC_INDICES")
  else
    echo "No mnemonic provided, skipping prefunding"
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

function prefund_accounts {
  local genesis_json="$1"
  local mnemonic="$2"
  local key_indices="$3"
  local updated_json="$genesis_json"

  # Initialize array to store addresses
  declare -a VALIDATOR_ADDRESSES_LIST

  # Generate addresses from key indices from mnemonic
  # Creates an array of key_indices
  IFS=',' read -ra INDICES <<< "$key_indices"
  for i in "${INDICES[@]}"; do
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
function create_beacon_genesis {
  local execution_genesis_path="$1"
  local beacon_mnemonics_path="./config/mnemonics.yaml"
  local beacon_config_path="./config/config.yaml"
  local beacon_genesis_path="./out"

  echo "Creating beacon genesis using:"
  echo "  Beacon mnemonics path: $beacon_mnemonics_path"
  echo "  Beacon config path: $beacon_config_path"
  echo "  Execution genesis path: $execution_genesis_path"

  # update the templates block time if it is provided
  cp "$DIR_PATH/$beacon_config_path" "$DIR_PATH/tmp/config.yaml"
  if [[ -n "${BLOCK_TIME:-}" ]]; then
    yq eval ".SECONDS_PER_SLOT = ${BLOCK_TIME}" -i "$DIR_PATH/tmp/config.yaml"
    yq eval ".SECONDS_PER_ETH1_BLOCK = ${BLOCK_TIME}" -i "$DIR_PATH/tmp/config.yaml"
  fi

  # Update the chain id if it is provided
  if [[ -n "${CHAIN_ID:-}" ]]; then
    yq eval ".DEPOSIT_CHAIN_ID = ${CHAIN_ID}" -i "$DIR_PATH/tmp/config.yaml"
    yq eval ".DEPOSIT_NETWORK_ID = ${CHAIN_ID}" -i "$DIR_PATH/tmp/config.yaml"
  fi

  # Copy mnemonics file to tmp and update it with provided mnemonic
  cp "$DIR_PATH/config/mnemonics.yaml" "$DIR_PATH/tmp/mnemonics.yaml"
  yq eval '.0.mnemonic = "'"$MNEMONIC"'"' -i "$DIR_PATH/tmp/mnemonics.yaml"

  # Run the protolamba's eth2 testnet genesis container

  docker run --rm \
    -v "$DIR_PATH/config:/app/config" \
    -v "$DIR_PATH/tmp:/app/tmp" \
    -v "$DIR_PATH/out:/app/out" \
    maddiaa/eth2-testnet-genesis deneb \
      --config="./tmp/config.yaml" \
      --eth1-config="./tmp/genesis.json" \
      --preset-phase0=minimal \
      --preset-altair=minimal \
      --preset-bellatrix=minimal \
      --preset-capella=minimal \
      --preset-deneb=minimal \
      --state-output="${beacon_genesis_path}/genesis.ssz" \
      --tranches-dir="$beacon_genesis_path" \
      --mnemonics="./tmp/mnemonics.yaml" \
      --eth1-withdrawal-address="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
      --eth1-match-genesis-time


  cp "$DIR_PATH/tmp/genesis.json" "$DIR_PATH/out/genesis.json"
  cp "$DIR_PATH/tmp/config.yaml" "$DIR_PATH/out/config.yaml"

  if [[ $? -ne 0 ]]; then
    echo "Error: eth2-testnet-genesis failed."
    exit 1
  fi

  echo "Beacon genesis created at $beacon_genesis_path"
}

function create_deposit_contract_block {
  echo 0 > "$DIR_PATH/out/deposit_contract_block.txt"
  echo "Deposit contract block created at $DIR_PATH/out/deposit_contract_block.txt"
}

## The ssz file must be written in base64 in order for a config map to accept it
function write_ssz_file_base64 {
  local ssz_file="$DIR_PATH/out/genesis.ssz"
  local output_file="$DIR_PATH/out/genesis-ssz"
  base64 -w 0 "$ssz_file" > "$output_file"
  echo "SSZ file base64 encoded at $output_file"
}

# Main
beacon_config_path="$DIR_PATH/config/config.yaml"
genesis_json_path="$DIR_PATH/config/genesis.json"

mkdir -p "$DIR_PATH/out"
mkdir -p "$DIR_PATH/tmp"

create_execution_genesis "$DIR_PATH/config/genesis.json" "$DIR_PATH/tmp/genesis.json"
create_beacon_genesis "$DIR_PATH/tmp/genesis.json"
create_deposit_contract_block
write_ssz_file_base64

cp "$DIR_PATH/config/jwt-secret.hex" "$DIR_PATH/out/jwt-secret.hex"
echo "Genesis files copied to ./out"
