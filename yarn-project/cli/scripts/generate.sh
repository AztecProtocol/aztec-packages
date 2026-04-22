#!/usr/bin/env bash
# Generates per-network TypeScript configs from .env files.
#
# Source: spartan/environments/{common,devnet,testnet,mainnet}.env
#         (codegen:l1-contracts + codegen:slasher + codegen:operational sections)
# Output: yarn-project/cli/src/config/generated/networks.ts
set -euo pipefail

cd $(git rev-parse --show-toplevel)
source spartan/scripts/codegen_helper.sh

NETWORKS=(devnet testnet mainnet)
ENV_DIR="spartan/environments"
SECTIONS="l1-contracts slasher operational"

mkdir -p yarn-project/cli/src/config/generated

echo "Generating networks.ts from spartan/environments/*.env..."

{
  cat << 'HEADER'
// Auto-generated from spartan/environments/*.env
// Do not edit manually - run yarn generate to regenerate

HEADER

  for network in "${NETWORKS[@]}"; do
    echo "export const ${network}Config = {"
    extract_codegen_keys "$SECTIONS" "${ENV_DIR}/common.env" "${ENV_DIR}/${network}.env" | format_ts_properties
    echo "} as const;"
    echo ""
  done
} > yarn-project/cli/src/config/generated/networks.ts

echo "Done!"
