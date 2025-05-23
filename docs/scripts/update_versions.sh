#!/bin/bash

# This script updates versions.json to only contain the latest regular version and latest alpha-testnet version.
# It:
# 1. Reads version numbers from both versioned_docs directory and versions.json
# 2. For each version type (regular and alpha), keeps the newer version between:
#    - The latest version from versioned_docs
#    - The version from versions.json
# 3. Creates a new array with alpha-testnet version first, followed by regular version
# 4. Writes the filtered array back to versions.json
# The resulting versions.json will always contain exactly two versions:
# - The latest alpha-testnet version (e.g. "v0.84.0-alpha-testnet.2")
# - The latest regular version (e.g. "v0.85.0")

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"

# Path to versions.json
VERSIONS_FILE="$DOCS_DIR/versions.json"
VERSIONED_DOCS_DIR="$DOCS_DIR/versioned_docs"

# Get versions from versioned_docs/
DOCS_VERSIONS=$(ls -1 $VERSIONED_DOCS_DIR | sed 's/version-//')
DOCS_REGULAR=$(echo "$DOCS_VERSIONS" | grep -v "alpha-testnet" | sort -V | tail -n1)
DOCS_ALPHA=$(echo "$DOCS_VERSIONS" | grep "alpha-testnet" | sort -V | tail -n1)

# Get versions from versions.json
JSON_VERSIONS=$(cat $VERSIONS_FILE)
JSON_REGULAR=$(echo "$JSON_VERSIONS" | jq -r '.[] | select(contains("alpha-testnet") | not) | .')
JSON_ALPHA=$(echo "$JSON_VERSIONS" | jq -r '.[] | select(contains("alpha-testnet")) | .')

# Compare versions and keep the newer one for each type
REGULAR_VERSION=$(printf "%s\n%s" "$DOCS_REGULAR" "$JSON_REGULAR" | sort -V | tail -n1)
ALPHA_VERSION=$(printf "%s\n%s" "$DOCS_ALPHA" "$JSON_ALPHA" | sort -V | tail -n1)

# Create json with alpha version first
NEW_VERSIONS=$(jq --null-input --arg alpha "$ALPHA_VERSION" --arg regular "$REGULAR_VERSION" '[ $alpha, $regular ]')

# Write back to file
echo $NEW_VERSIONS | jq '.' >$VERSIONS_FILE

echo "Updated versions.json successfully"
echo "New versions:"
cat $VERSIONS_FILE
