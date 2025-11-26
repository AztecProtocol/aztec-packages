#!/usr/bin/env bash

set -euo pipefail

# Diffs network config between main branch and a PR branch to extract only NEW resources
# Usage: diff_network_config.sh <pr_number> <network_name>

# Basic logging helpers
log() { echo "[INFO]  $(date -Is) - $*" >&2; }
err() { echo "[ERROR] $(date -Is) - $*" >&2; }
die() { err "$*"; exit 1; }

# Check arguments
if [[ $# -lt 2 ]]; then
  die "Usage: $0 <pr_number> <network_name>"
fi

PR_NUMBER="$1"
NETWORK_NAME="$2"

# URLs for fetching configs
MAIN_CONFIG_URL="https://raw.githubusercontent.com/AztecProtocol/networks/main/network_config.json"
PR_CONFIG_URL="https://raw.githubusercontent.com/AztecProtocol/networks/refs/pull/${PR_NUMBER}/merge/network_config.json"

# Temporary files
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

MAIN_CONFIG_FILE="${TMP_DIR}/main_config.json"
PR_CONFIG_FILE="${TMP_DIR}/pr_config.json"
DIFF_OUTPUT_FILE="${TMP_DIR}/diff_output.json"

log "Fetching main branch network config..."
if ! curl -f -s -L "$MAIN_CONFIG_URL" -o "$MAIN_CONFIG_FILE"; then
  die "Failed to fetch main branch config from $MAIN_CONFIG_URL"
fi

log "Fetching PR #${PR_NUMBER} network config..."
if ! curl -f -s -L "$PR_CONFIG_URL" -o "$PR_CONFIG_FILE"; then
  die "Failed to fetch PR config from $PR_CONFIG_URL"
fi

# Validate network exists in both configs
if ! jq -e ".${NETWORK_NAME}" "$MAIN_CONFIG_FILE" >/dev/null 2>&1; then
  die "Network '${NETWORK_NAME}' not found in main branch config"
fi

if ! jq -e ".${NETWORK_NAME}" "$PR_CONFIG_FILE" >/dev/null 2>&1; then
  die "Network '${NETWORK_NAME}' not found in PR config"
fi

log "Extracting network configs for '${NETWORK_NAME}'..."
MAIN_NETWORK=$(jq ".${NETWORK_NAME}" "$MAIN_CONFIG_FILE")
PR_NETWORK=$(jq ".${NETWORK_NAME}" "$PR_CONFIG_FILE")

# Extract arrays
MAIN_BOOTNODES=$(echo "$MAIN_NETWORK" | jq -r '.bootnodes[]' 2>/dev/null || echo "")
PR_BOOTNODES=$(echo "$PR_NETWORK" | jq -r '.bootnodes[]' 2>/dev/null || echo "")

MAIN_SNAPSHOTS=$(echo "$MAIN_NETWORK" | jq -r '.snapshots[]' 2>/dev/null || echo "")
PR_SNAPSHOTS=$(echo "$PR_NETWORK" | jq -r '.snapshots[]' 2>/dev/null || echo "")

# Find NEW bootnodes (in PR but not in main)
log "Diffing bootnodes..."
NEW_BOOTNODES_ARRAY="[]"
if [[ -n "$PR_BOOTNODES" ]]; then
  while IFS= read -r pr_bootnode; do
    if [[ -n "$pr_bootnode" ]]; then
      # Check if this bootnode exists in main
      if ! echo "$MAIN_BOOTNODES" | grep -Fxq "$pr_bootnode"; then
        NEW_BOOTNODES_ARRAY=$(echo "$NEW_BOOTNODES_ARRAY" | jq --arg bn "$pr_bootnode" '. + [$bn]')
      fi
    fi
  done <<< "$PR_BOOTNODES"
fi

# Find NEW snapshots (in PR but not in main)
log "Diffing snapshots..."
NEW_SNAPSHOTS_ARRAY="[]"
if [[ -n "$PR_SNAPSHOTS" ]]; then
  while IFS= read -r pr_snapshot; do
    if [[ -n "$pr_snapshot" ]]; then
      # Check if this snapshot exists in main
      if ! echo "$MAIN_SNAPSHOTS" | grep -Fxq "$pr_snapshot"; then
        NEW_SNAPSHOTS_ARRAY=$(echo "$NEW_SNAPSHOTS_ARRAY" | jq --arg snap "$pr_snapshot" '. + [$snap]')
      fi
    fi
  done <<< "$PR_SNAPSHOTS"
fi

# Extract other required fields from PR config
REGISTRY_ADDRESS=$(echo "$PR_NETWORK" | jq -r '.registryAddress')
L1_CHAIN_ID=$(echo "$PR_NETWORK" | jq -r '.l1ChainId')
FEE_ASSET_HANDLER_ADDRESS=$(echo "$PR_NETWORK" | jq -r '.feeAssetHandlerAddress // ""')

# Validate at least one new resource exists
NEW_BOOTNODE_COUNT=$(echo "$NEW_BOOTNODES_ARRAY" | jq 'length')
NEW_SNAPSHOT_COUNT=$(echo "$NEW_SNAPSHOTS_ARRAY" | jq 'length')

if [[ "$NEW_BOOTNODE_COUNT" -eq 0 ]] && [[ "$NEW_SNAPSHOT_COUNT" -eq 0 ]]; then
  die "No new bootnodes or snapshots found in PR. Nothing to validate."
fi

log "Found $NEW_BOOTNODE_COUNT new bootnode(s) and $NEW_SNAPSHOT_COUNT new snapshot(s)"

# Build output JSON
jq -n \
  --argjson bootnodes "$NEW_BOOTNODES_ARRAY" \
  --argjson snapshots "$NEW_SNAPSHOTS_ARRAY" \
  --arg registry "$REGISTRY_ADDRESS" \
  --arg l1ChainId "$L1_CHAIN_ID" \
  --arg feeAssetHandler "$FEE_ASSET_HANDLER_ADDRESS" \
  '{
    new_bootnodes: $bootnodes,
    new_snapshots: $snapshots,
    registry_address: $registry,
    l1_chain_id: $l1ChainId,
    fee_asset_handler_address: $feeAssetHandler
  }' > "$DIFF_OUTPUT_FILE"

# Output the result to stdout
cat "$DIFF_OUTPUT_FILE"

log "Config diff completed successfully"
