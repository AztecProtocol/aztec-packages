#!/usr/bin/env bash
set -eu

# if the registry address is already set and the bootstrap nodes are set, then we don't need to wait for the services
if [ -n "$REGISTRY_CONTRACT_ADDRESS" ] && [ -n "$BOOTSTRAP_NODES" ]; then
  cat <<EOF >/shared/contracts/contracts.env
export BOOTSTRAP_NODES=$BOOTSTRAP_NODES
export REGISTRY_CONTRACT_ADDRESS=$REGISTRY_CONTRACT_ADDRESS
export SLASH_FACTORY_CONTRACT_ADDRESS=$SLASH_FACTORY_CONTRACT_ADDRESS
export FEE_ASSET_HANDLER_CONTRACT_ADDRESS=$FEE_ASSET_HANDLER_CONTRACT_ADDRESS
EOF
  cat /shared/contracts/contracts.env
  exit 0
fi

# Pass a PXE url as an argument
# Ask the PXE's node for l1 contract addresses
output=$(node --no-warnings /usr/src/yarn-project/aztec/dest/bin/index.js get-node-info -u $1)

echo "$output"

boot_node_enr=""
if [ "$P2P_ENABLED" = "true" ]; then
  # Only look for boot node ENR if P2P is enabled
  boot_node_enr=$(echo "$output" | grep -oP 'Node ENR: \Kenr:[a-zA-Z0-9\-\_\.]+')
fi
registry_address=$(echo "$output" | grep -oP 'Registry Address: \K0x[a-fA-F0-9]{40}')
slash_factory_address=$(echo "$output" | grep -oP 'SlashFactory Address: \K0x[a-fA-F0-9]{40}')
fee_asset_handler_address=$(echo "$output" | grep -oP 'FeeAssetHandler Address: \K0x[a-fA-F0-9]{40}')

# Write the addresses to a file in the shared volume
cat <<EOF >/shared/contracts/contracts.env
export BOOTSTRAP_NODES=$boot_node_enr
export REGISTRY_CONTRACT_ADDRESS=$registry_address
export SLASH_FACTORY_CONTRACT_ADDRESS=$slash_factory_address
export FEE_ASSET_HANDLER_CONTRACT_ADDRESS=$fee_asset_handler_address
EOF

cat /shared/contracts/contracts.env
