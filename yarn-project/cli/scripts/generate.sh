#!/usr/bin/env bash
# Generates per-network TypeScript configs from network-defaults.yml.
#
# Source: spartan/environments/network-defaults.yml -> networks
# Output: yarn-project/cli/src/config/generated/networks.ts
set -euo pipefail

cd $(git rev-parse --show-toplevel)

mkdir -p yarn-project/cli/src/config/generated

echo "Generating networks.ts from spartan/environments/network-defaults.yml..."

# Generate TypeScript file with all network configs
cat > yarn-project/cli/src/config/generated/networks.ts << 'HEADER'
// Auto-generated from spartan/environments/network-defaults.yml
// Do not edit manually - run yarn generate to regenerate

HEADER

# Get all network keys from the networks section
networks=$(yq -o json '.networks | keys' spartan/environments/network-defaults.yml | jq -r '.[]')

for network in $networks; do
  echo "export const ${network}Config = {" >> yarn-project/cli/src/config/generated/networks.ts
  yq -o json "explode(.) | .networks.$network // {}" spartan/environments/network-defaults.yml | \
    jq -r "to_entries | .[] | \"  \\(.key): \\(.value | if type == \"string\" then \"'\\(.)'\" else . end),\"" \
    >> yarn-project/cli/src/config/generated/networks.ts
  echo "} as const;" >> yarn-project/cli/src/config/generated/networks.ts
  echo "" >> yarn-project/cli/src/config/generated/networks.ts
done

echo "Done!"
