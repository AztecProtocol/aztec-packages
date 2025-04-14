#!/bin/bash

# This script updates versions.json to only contain the latest regular version and latest alpha-testnet version.
# It:
# 1. Reads the current versions from versions.json
# 2. Identifies the highest version number for both regular and alpha-testnet versions
# 3. Creates a new array containing only these two latest versions
# 4. Writes the filtered array back to versions.json
# The resulting versions.json will always contain exactly two versions:
# - The latest regular version (e.g. "v0.85.0")
# - The latest alpha-testnet version (e.g. "v0.84.0-alpha-testnet.2")

# Path to versions.json
VERSIONS_FILE="../versions.json"

# Read current versions
VERSIONS=$(cat $VERSIONS_FILE)

# Parse the array values
# Get the latest regular version
REGULAR_VERSION=$(echo $VERSIONS | jq -r '.[] | select(contains("alpha-testnet") | not) | .' | sort -V | tail -n1)
# Get the latest alpha version
ALPHA_VERSION=$(echo $VERSIONS | jq -r '.[] | select(contains("alpha-testnet")) | .' | sort -V | tail -n1)

# Create json to only keep the latest regular and alpha versions
NEW_VERSIONS=$(jq --null-input --arg regular "$REGULAR_VERSION" --arg alpha "$ALPHA_VERSION" '[ $regular, $alpha ]')

# Write back to file
echo $NEW_VERSIONS | jq '.' >$VERSIONS_FILE

echo "Updated versions.json successfully"
echo "New versions:"
cat $VERSIONS_FILE
