#!/usr/bin/env bash
set -euo pipefail

# Get the actual aztec version for the git tag.
AZTEC_VERSION=$(jq -r '.version' $(dirname $0)/../package.json)
NARGO_TOML_PATH="Nargo.toml"
MAIN_NR_PATH="src/main.nr"

if [ ! -f "$NARGO_TOML_PATH" ]; then
  >&2 echo "Warning: Could not find Nargo.toml at $NARGO_TOML_PATH to add aztec dependency"
  exit 1
fi

if [ ! -f "$MAIN_NR_PATH" ]; then
  >&2 echo "Warning: Could not find main.nr at $MAIN_NR_PATH"
  exit 1
fi

# Add aztec dependency to Nargo.toml
echo "" >> "$NARGO_TOML_PATH"
echo "aztec = { git=\"https://github.com/AztecProtocol/aztec-nr\", tag=\"v${AZTEC_VERSION}\", directory=\"aztec\" }" >> "$NARGO_TOML_PATH"
echo "Added aztec dependency (v${AZTEC_VERSION}) to Nargo.toml"

# Replace the contents of main.nr with the Aztec contract template
cat > "$MAIN_NR_PATH" << 'EOF'
use aztec::macros::aztec;

#[aztec]
contract Main {}
EOF
echo "Created main.nr with Aztec contract template"
