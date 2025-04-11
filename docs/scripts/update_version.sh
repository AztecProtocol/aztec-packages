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
REGULAR_VERSION=$(echo $VERSIONS | jq -r '.[0]')
ALPHA_VERSION=$(echo $VERSIONS | jq -r '.[1]')

# Update the appropriate version based on whether it's an alpha-testnet version
if [[ $NEW_VERSION == *"alpha-testnet"* ]]; then
    # Update alpha version
    NEW_VERSIONS=$(echo $VERSIONS | jq --arg new "$NEW_VERSION" '.[1] = $new')
else
    # Update regular version
    NEW_VERSIONS=$(echo $VERSIONS | jq --arg new "$NEW_VERSION" '.[0] = $new')
fi

# Write back to file
echo $NEW_VERSIONS | jq '.' >$VERSIONS_FILE

echo "Updated versions.json successfully"
echo "New versions:"
cat $VERSIONS_FILE
