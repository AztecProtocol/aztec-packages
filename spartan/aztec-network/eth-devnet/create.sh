#!/bin/bash

## TODO: allow updating of?
## - chain Id - block time?
## - Deployment mnemonics

set -euo pipefail

REPO=$(git rev-parse --show-toplevel)/spartan/aztec-network/eth-devnet

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

  # Write the updated Genesis JSON to the output file
  echo "$updated_json" > "$execution_genesis_output"
  echo "Execution genesis created at $execution_genesis_output"
}

# Function to create beacon genesis
# Uses the eth2-testnet-generator to generate beacon genesis state (genesis.ssz file)
# The selected eth1 block
create_beacon_genesis() {
  local mnemonics_path="$1"
  local beacon_config_path="$2"
  local execution_genesis_path="$3"
  local beacon_genesis_path="./out"

  echo "Creating beacon genesis using:"
  echo "  Mnemonics path: $mnemonics_path"
  echo "  Beacon config path: $beacon_config_path"
  echo "  Execution genesis path: $execution_genesis_path"

  # Run the protolamba's eth2 testnet genesis container
  echo "$REPO/config:/app/config"
  echo "$REPO/out:/app/out"
  docker run --rm \
    -v "$REPO/config:/app/config" \
    -v "$REPO/out:/app/out" \
    maddiaa/eth2-testnet-genesis deneb \
      --config="$beacon_config_path" \
      --preset-phase0=minimal \
      --preset-altair=minimal \
      --preset-bellatrix=minimal \
      --preset-capella=minimal \
      --preset-deneb=minimal \
      --eth1-config="./out/genesis.json" \
      --state-output="${beacon_genesis_path}/genesis.ssz" \
      --tranches-dir="$beacon_genesis_path" \
      --mnemonics="$mnemonics_path" \
      --eth1-withdrawal-address="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
      --eth1-match-genesis-time

  if [[ $? -ne 0 ]]; then
    echo "Error: eth2-testnet-genesis failed."
    exit 1
  fi

  echo "Beacon genesis created at $beacon_genesis_path"
}

create_deposit_contract_block() {
  echo 0 > "$REPO/out/deposit_contract_block.txt"
  echo "Deposit contract block created at $REPO/out/deposit_contract_block.txt"
}

write_ssz_file_base64() {
  local ssz_file="$REPO/out/genesis.ssz"
  local output_file="$REPO/out/genesis-ssz"
  base64 -w 0 "$ssz_file" > "$output_file"
  echo "SSZ file base64 encoded at $output_file"
}

# Main

# TODO: FIX THIS Files are relative to the mounted repo
mnemonics_path="./config/mnemonics.yaml"
beacon_config_path="./config/config.yaml"
execution_genesis_path="./config/genesis.json"

mkdir -p "$REPO/out"

create_execution_genesis "$REPO/config/genesis.json" "$REPO/out/genesis.json"
create_beacon_genesis "$mnemonics_path" "$beacon_config_path" "$REPO/out/genesis.json"
create_deposit_contract_block
write_ssz_file_base64

cp "$REPO/$beacon_config_path" "$REPO/out/config.yaml"
cp "$REPO/config/jwt-secret.hex" "$REPO/out/jwt-secret.hex"
echo "Genesis files copied to ./out"
