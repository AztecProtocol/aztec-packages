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

# format_value: Converts a YAML value string to a TypeScript literal.
# Handles scientific notation like "200000e18" by expanding to full integer,
# since BigInt() cannot parse scientific notation strings.
format_value() {
  local val="$1"
  # Expand integer scientific notation (e.g., 200000e18 -> 200000000000000000000000)
  if [[ "$val" =~ ^[0-9]+e[0-9]+$ ]]; then
    python3 -c "
import re, sys
m = re.match(r'^(\d+)e(\d+)$', sys.argv[1])
print(int(m.group(1)) * (10 ** int(m.group(2))))
" "$val"
  else
    echo "$val"
  fi
}

for network in $networks; do
  echo "export const ${network}Config = {" >> yarn-project/cli/src/config/generated/networks.ts

  # Use yq to iterate entries, converting values to strings to preserve
  # the original YAML text (avoids float64 precision loss for large numbers).
  while IFS= read -r line; do
    key=$(echo "$line" | cut -d':' -f1 | xargs)
    raw_value=$(echo "$line" | cut -d':' -f2- | xargs)

    formatted=$(format_value "$raw_value")

    # Determine TypeScript formatting: strings get quotes, booleans/numbers are bare
    if [[ "$formatted" == "true" || "$formatted" == "false" ]]; then
      echo "  $key: $formatted," >> yarn-project/cli/src/config/generated/networks.ts
    elif [[ "$formatted" =~ ^-?[0-9]*\.?[0-9]+$ ]]; then
      echo "  $key: $formatted," >> yarn-project/cli/src/config/generated/networks.ts
    else
      echo "  $key: '$formatted'," >> yarn-project/cli/src/config/generated/networks.ts
    fi
  done < <(yq "explode(.) | .networks.$network | to_entries | .[] | .key + \": \" + (.value | . tag = \"!!str\")" spartan/environments/network-defaults.yml)

  echo "} as const;" >> yarn-project/cli/src/config/generated/networks.ts
  echo "" >> yarn-project/cli/src/config/generated/networks.ts
done

echo "Done!"
