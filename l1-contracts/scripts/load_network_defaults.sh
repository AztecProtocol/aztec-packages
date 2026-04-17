#!/usr/bin/env bash
set -euo pipefail

# Load L1 contract defaults from .env files for a given network.
# Exports AZTEC_* and ETHEREUM_SLOT_DURATION env vars.
#
# Usage:
#   source ./scripts/load_network_defaults.sh <network>
#
# Networks: mainnet, testnet, devnet

network="${1:?Usage: $0 <network|common>}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_dir="${script_dir}/../../spartan/environments"
env_file="${env_dir}/${network}.env"

if [[ ! -f "$env_file" ]]; then
  echo "ERROR: ${network}.env not found at $env_file" >&2
  exit 1
fi

# Source the network env file in a subshell and extract AZTEC_*/ETHEREUM_SLOT_DURATION vars.
# The env file sources common.env internally, so we get full resolution.
while IFS='=' read -r key value; do
  if [[ -z "${!key:-}" ]]; then
    export "$key"="$value"
  fi
done < <(
  set +u 2>/dev/null || true
  set +e 2>/dev/null || true
  source "$env_file" 2>/dev/null
  for var in $(compgen -v); do
    if [[ "$var" =~ ^AZTEC_ ]] || [[ "$var" == "ETHEREUM_SLOT_DURATION" ]]; then
      echo "$var=${!var}"
    fi
  done
)
