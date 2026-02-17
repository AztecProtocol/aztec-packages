#!/usr/bin/env bash
# Generates l1-contracts-defaults.ts from network-defaults.yml.
#
# Source: spartan/environments/network-defaults.yml -> l1-contracts
# Output: yarn-project/ethereum/src/generated/l1-contracts-defaults.ts
set -euo pipefail

cd $(git rev-parse --show-toplevel)

mkdir -p yarn-project/ethereum/src/generated

echo "Generating l1-contracts-defaults.ts from spartan/environments/network-defaults.yml..."

# Generate TypeScript file with typed defaults
cat > yarn-project/ethereum/src/generated/l1-contracts-defaults.ts << 'HEADER'
// Auto-generated from spartan/environments/network-defaults.yml
// Do not edit manually - run yarn generate to regenerate

/** Default L1 contracts configuration values from network-defaults.yml */
export const l1ContractsDefaultEnv = {
HEADER

# Extract l1-contracts section and format as TypeScript object properties (single quotes for strings)
yq -o json '."l1-contracts"' spartan/environments/network-defaults.yml | \
  jq -r "to_entries | .[] | \"  \\(.key): \\(.value | if type == \"string\" then \"'\\(.)'\" else . end),\"" \
  >> yarn-project/ethereum/src/generated/l1-contracts-defaults.ts

cat >> yarn-project/ethereum/src/generated/l1-contracts-defaults.ts << 'FOOTER'
} as const;
FOOTER

echo "Done!"
