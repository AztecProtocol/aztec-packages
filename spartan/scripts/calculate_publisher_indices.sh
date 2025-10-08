#!/usr/bin/env bash

# Helper script to calculate all publisher key indices for a given environment
# This is used to determine which keys need funding

set -euo pipefail

# --- Usage ---
if [ "$#" -lt 1 ]; then
    echo "Usage: $0 ENVIRONMENT_FILE"
    echo "Example: $0 staging-public"
    exit 1
fi

spartan=$(git rev-parse --show-toplevel)/spartan

ENVIRONMENT_FILE="$spartan/environments/$1.env"

if [ ! -f "$ENVIRONMENT_FILE" ]; then
    echo "Error: Environment file not found: $ENVIRONMENT_FILE"
    exit 1
fi

# Source the environment file to get configuration
source "$ENVIRONMENT_FILE"

# Set defaults (same as deploy_network.sh)
VALIDATOR_REPLICAS=${VALIDATOR_REPLICAS:-4}
VALIDATORS_PER_NODE=${VALIDATORS_PER_NODE:-12}
PUBLISHERS_PER_VALIDATOR_KEY=${PUBLISHERS_PER_VALIDATOR_KEY:-2}
VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX=${VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX:-5000}

PUBLISHERS_PER_PROVER=${PUBLISHERS_PER_PROVER:-2}
PROVER_PUBLISHER_MNEMONIC_START_INDEX=${PROVER_PUBLISHER_MNEMONIC_START_INDEX:-8000}

# Calculate validator publisher indices
TOTAL_VALIDATOR_KEYS=$((VALIDATOR_REPLICAS * VALIDATORS_PER_NODE))
TOTAL_VALIDATOR_PUBLISHERS=$((TOTAL_VALIDATOR_KEYS * PUBLISHERS_PER_VALIDATOR_KEY))

VALIDATOR_PUBLISHER_INDICES=""
if (( TOTAL_VALIDATOR_PUBLISHERS > 0 )); then
  VALIDATOR_PUBLISHER_INDICES=$(seq "$VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX" $((VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX + TOTAL_VALIDATOR_PUBLISHERS - 1)) | tr '\n' ',' | sed 's/,$//')
fi

# Calculate prover publisher indices
TOTAL_PROVER_PUBLISHERS=$PUBLISHERS_PER_PROVER

PROVER_PUBLISHER_INDICES=""
if (( TOTAL_PROVER_PUBLISHERS > 0 )); then
  PROVER_PUBLISHER_INDICES=$(seq "$PROVER_PUBLISHER_MNEMONIC_START_INDEX" $((PROVER_PUBLISHER_MNEMONIC_START_INDEX + TOTAL_PROVER_PUBLISHERS - 1)) | tr '\n' ',' | sed 's/,$//')
fi

# Combine all publisher indices
ALL_PUBLISHER_INDICES=""
if [ -n "$VALIDATOR_PUBLISHER_INDICES" ]; then
  ALL_PUBLISHER_INDICES="$VALIDATOR_PUBLISHER_INDICES"
fi

if [ -n "$PROVER_PUBLISHER_INDICES" ]; then
  if [ -n "$ALL_PUBLISHER_INDICES" ]; then
    ALL_PUBLISHER_INDICES="${ALL_PUBLISHER_INDICES},${PROVER_PUBLISHER_INDICES}"
  else
    ALL_PUBLISHER_INDICES="$PROVER_PUBLISHER_INDICES"
  fi
fi

# Output the comma-separated list of indices
echo "$ALL_PUBLISHER_INDICES"
