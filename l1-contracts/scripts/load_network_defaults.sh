#!/usr/bin/env bash
set -euo pipefail

# Load L1 contract defaults from network-defaults.yml for a given network.
# Exports AZTEC_* and ETHEREUM_* env vars with YAML anchor inheritance resolved.
#
# Usage:
#   source ./scripts/load_network_defaults.sh <network>
#
# Networks: mainnet, testnet, devnet

network="${1:?Usage: $0 <network>}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
network_defaults="${script_dir}/../../spartan/environments/network-defaults.yml"

if [[ ! -f "$network_defaults" ]]; then
  echo "ERROR: network-defaults.yml not found at $network_defaults" >&2
  exit 1
fi

# explode(.) resolves YAML anchors (<<: *prodlike inheritance)
# Output as props, filter comments, normalize spacing
while IFS='=' read -r key value; do
  export "$key"="$value"
done < <(yq -o=props "explode(.) | .networks.$network | with_entries(select(.key | test(\"^AZTEC_|^ETHEREUM_\")))" "$network_defaults" \
  | grep -v '^#' \
  | grep -v '^$' \
  | sed 's/ = /=/')
