#!/bin/bash

# This script updates versions.json with the latest version from versioned_docs.
# The resulting versions.json will contain exactly one version (e.g. "v0.85.0")

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"

# Path to versions.json
VERSIONS_FILE="$DOCS_DIR/versions.json"
VERSIONED_DOCS_DIR="$DOCS_DIR/versioned_docs"

# Get latest version from versioned_docs/, excluding "Latest"
LATEST_VERSION=$(ls -1 $VERSIONED_DOCS_DIR | sed 's/version-//' | grep -v "Latest" | sort -V | tail -n1)

# Remove "Latest" from versions.json if it exists
if [ -f "$VERSIONS_FILE" ]; then
    jq 'map(select(. != "Latest"))' "$VERSIONS_FILE" > "$VERSIONS_FILE.tmp" && mv "$VERSIONS_FILE.tmp" "$VERSIONS_FILE"
fi

# Create json with the latest version
NEW_VERSIONS=$(jq --null-input --arg version "$LATEST_VERSION" '[ $version ]')

# Write back to file
echo $NEW_VERSIONS | jq '.' >$VERSIONS_FILE

echo "Updated versions.json successfully"
echo "New version:"
cat $VERSIONS_FILE
