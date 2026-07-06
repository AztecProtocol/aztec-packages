#!/usr/bin/env bash
set -euo pipefail

# Load the canonical L1 contract defaults from network-defaults.json.
# Exports every key in the file as an env var (all AZTEC_* / ETHEREUM_*).
#
# Usage:
#   source ./scripts/load_network_defaults.sh

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
network_defaults="${script_dir}/network-defaults.json"

if [[ ! -f "$network_defaults" ]]; then
  echo "ERROR: network-defaults.json not found at $network_defaults" >&2
  exit 1
fi

# jq preserves large integer literals verbatim (e.g. 100000000000000000000), which vm.envUint requires.
while IFS='=' read -r key value; do
  export "$key"="$value"
done < <(jq -r 'to_entries[] | "\(.key)=\(.value)"' "$network_defaults")
