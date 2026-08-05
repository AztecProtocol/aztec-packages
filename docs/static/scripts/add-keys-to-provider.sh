#!/usr/bin/env bash
# add-keys-to-provider.sh — build the addKeysToProvider call for a staking provider.
# Reads a keyN_staker_output.json (from `aztec validator-keys new --staker-output`)
# and prints a ready-to-run `cast send` that queues those attester keys.
#
# Source: Aztec operator docs
# Usage:
#   STAKING_REGISTRY=0x... PROVIDER_ID=42 ETH_RPC=https://... \
#     ./add-keys-to-provider.sh ~/.aztec/keystore/key1_staker_output.json
#
# The printed command has a placeholder for the admin private key. Fill it in
# (or add --private-key / --ledger yourself) before sending. The signer must be
# the provider admin address you set at registration.

set -u

KEYSTORE_FILE="${1:?Usage: STAKING_REGISTRY=0x... PROVIDER_ID=N ETH_RPC=https://... $0 <staker_output.json>}"
: "${STAKING_REGISTRY:?STAKING_REGISTRY env var required (the Staking Registry address)}"
: "${PROVIDER_ID:?PROVIDER_ID env var required (your providerIdentifier)}"
: "${ETH_RPC:?ETH_RPC env var required}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found in PATH. Install it and retry." >&2
  exit 1
fi
if ! command -v cast >/dev/null 2>&1; then
  echo "cast (Foundry) not found in PATH. Install: curl -L https://foundry.paradigm.xyz | bash && foundryup" >&2
  exit 1
fi
if [ ! -f "$KEYSTORE_FILE" ]; then
  echo "Keystore file not found: $KEYSTORE_FILE" >&2
  exit 1
fi

strip0x() { echo "${1#0x}"; }

keys_array_str="["
first=1

while IFS= read -r entry; do
  attester=$(jq -r '.attester' <<<"$entry")

  pkG1_x=$(jq -r '.publicKeyG1.x' <<<"$entry")
  pkG1_y=$(jq -r '.publicKeyG1.y' <<<"$entry")

  pkG2_x0=$(jq -r '.publicKeyG2.x0' <<<"$entry")
  pkG2_x1=$(jq -r '.publicKeyG2.x1' <<<"$entry")
  pkG2_y0=$(jq -r '.publicKeyG2.y0' <<<"$entry")
  pkG2_y1=$(jq -r '.publicKeyG2.y1' <<<"$entry")

  pop_x=$(jq -r '.proofOfPossession.x' <<<"$entry")
  pop_y=$(jq -r '.proofOfPossession.y' <<<"$entry")

  tuple="($attester,(0x$(strip0x "$pkG1_x"),0x$(strip0x "$pkG1_y")),(0x$(strip0x "$pkG2_x0"),0x$(strip0x "$pkG2_x1"),0x$(strip0x "$pkG2_y0"),0x$(strip0x "$pkG2_y1")),(0x$(strip0x "$pop_x"),0x$(strip0x "$pop_y")))"

  if [ $first -eq 1 ]; then
    keys_array_str+="$tuple"
    first=0
  else
    keys_array_str+=",$tuple"
  fi
done < <(jq -c '.[]' "$KEYSTORE_FILE")

keys_array_str+="]"

if [ $first -eq 1 ]; then
  echo "No entries found in $KEYSTORE_FILE" >&2
  exit 1
fi

cat <<EOF
cast send $STAKING_REGISTRY \\
  "addKeysToProvider(uint256,(address,(uint256,uint256),(uint256,uint256,uint256,uint256),(uint256,uint256))[])" \\
  $PROVIDER_ID \\
  "$keys_array_str" \\
  --rpc-url $ETH_RPC \\
  --private-key <provider-admin-private-key>
EOF
