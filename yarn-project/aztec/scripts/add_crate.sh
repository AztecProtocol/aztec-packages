#!/usr/bin/env bash
set -euo pipefail

# Creates a contract+test crate pair and adds them to an existing workspace.
# Usage: add_crate.sh <crate_name> <template>
# Must be called from a workspace root that already has Nargo.toml with [workspace].

crate_name=$1
template=$2

if [ -z "$crate_name" ]; then
  echo "Error: crate name is required"
  exit 1
fi

if [[ "$crate_name" == *"/"* ]] || [[ "$crate_name" == *"\\"* ]]; then
  echo "Error: crate name must not contain path separators"
  exit 1
fi

contract_dir="${crate_name}_contract"
test_dir="${crate_name}_test"

if [ -d "$contract_dir" ]; then
  echo "Error: directory '$contract_dir' already exists"
  exit 1
fi
if [ -d "$test_dir" ]; then
  echo "Error: directory '$test_dir' already exists"
  exit 1
fi

# Get the actual aztec version for the git tag.
AZTEC_VERSION=$(jq -r '.version' $(dirname $0)/../package.json)
TEMPLATE_DIR="$(dirname $0)/templates/$template"

# Copy template crates and substitute placeholders
cp -r "$TEMPLATE_DIR/contract" "$contract_dir"
cp -r "$TEMPLATE_DIR/test" "$test_dir"
# Use perl -i for portability across os.
find "$contract_dir" "$test_dir" -type f -exec \
  perl -i -pe "s/__CRATE_NAME__/${crate_name}/g; s/__AZTEC_VERSION__/${AZTEC_VERSION}/g" {} +

# Add members to workspace Nargo.toml
if grep -q 'members\s*=\s*\[\s*\]' Nargo.toml; then
  # Empty array: members = []
  perl -i -pe "s|members\s*=\s*\[\s*\]|members = [\"${contract_dir}\", \"${test_dir}\"]|" Nargo.toml
else
  # Non-empty array: add before closing ]
  perl -i -pe "s|(members\s*=\s*\[.*)\]|\1, \"${contract_dir}\", \"${test_dir}\"]|" Nargo.toml
fi

echo "Created crates '${contract_dir}' and '${test_dir}'"
