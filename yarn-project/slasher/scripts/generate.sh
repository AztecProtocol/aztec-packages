#!/usr/bin/env bash
# Generates slasher-defaults.ts from network-defaults.yml.
#
# Source: spartan/environments/network-defaults.yml -> slasher
# Output: yarn-project/slasher/src/generated/slasher-defaults.ts
set -euo pipefail

cd $(git rev-parse --show-toplevel)

mkdir -p yarn-project/slasher/src/generated

echo "Generating slasher-defaults.ts from spartan/environments/network-defaults.yml..."

# Generate TypeScript file with typed defaults
cat > yarn-project/slasher/src/generated/slasher-defaults.ts << 'HEADER'
// Auto-generated from spartan/environments/network-defaults.yml
// Do not edit manually - run yarn generate to regenerate

/** Default slasher configuration values from network-defaults.yml */
export const slasherDefaultEnv = {
HEADER

# Extract slasher section and format as TypeScript object properties (single quotes for strings)
yq -o json '.slasher' spartan/environments/network-defaults.yml | \
  jq -r "to_entries | .[] | \"  \\(.key): \\(.value | if type == \"string\" then \"'\\(.)'\" else . end),\"" \
  >> yarn-project/slasher/src/generated/slasher-defaults.ts

cat >> yarn-project/slasher/src/generated/slasher-defaults.ts << 'FOOTER'
} as const;
FOOTER

echo "Done!"
