#!/bin/bash

# Extract keys from package.json
TARGET_PKGS=$(jq -r '.dependencies | to_entries[] | select(.key | startswith("@aztec/") and .key != "@aztec/end-to-end") | .key' package.json)

echo $TARGET_PKGS
