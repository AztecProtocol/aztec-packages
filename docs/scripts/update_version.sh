#!/bin/bash

# Get the version from the first argument
NEW_VERSION=$1

if [ -z "$NEW_VERSION" ]; then
    echo "Error: Version argument is required"
    exit 1
fi

# Path to versions.json
VERSIONS_FILE="../versions.json"

# Read current versions
VERSIONS=$(cat $VERSIONS_FILE)

# Parse the array values
# Get the latest regular version
REGULAR_VERSION=$(echo $VERSIONS | jq -r '.[] | select(contains("alpha-testnet") | not) | .' | sort -V | tail -n1)
# Get the latest alpha version
ALPHA_VERSION=$(echo $VERSIONS | jq -r '.[] | select(contains("alpha-testnet")) | .' | sort -V | tail -n1)

# Filter versions.json to only keep the latest regular and alpha versions
NEW_VERSIONS=$(echo $VERSIONS | jq --arg regular "$REGULAR_VERSION" --arg alpha "$ALPHA_VERSION" '[ $regular, $alpha ]')

# Write back to file
echo $NEW_VERSIONS | jq '.' >$VERSIONS_FILE

echo "Updated versions.json successfully"
echo "New versions:"
cat $VERSIONS_FILE
