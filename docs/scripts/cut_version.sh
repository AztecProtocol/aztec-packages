#!/bin/bash

# This script cuts a new version of the documentation for a given tag.
# It performs the following steps:
# 1. Verifies the script is run from the docs directory
# 2. Checks if the provided tag is a valid semver
# 3. Builds the documentation
# 4. Creates a new version using Docusaurus
# 5. Updates versions.json
# 6. Creates a new branch, commits changes, and opens a PR

# Exit on error
set -e

# Check if we're in the docs directory
if [ ! -f "docusaurus.config.js" ]; then
    echo "Error: This script must be run from the docs directory"
    exit 1
fi

if semver check $REF_NAME; then
  # Ensure that released versions don't use cache from non-released versions (they will have incorrect links to master)
  hash+=$REF_NAME
  export COMMIT_TAG=$REF_NAME
fi

echo "Cutting new docs version: $COMMIT_TAG"

# Initialize versions.json if it doesn't exist
if [ ! -f "versions.json" ]; then
    echo "[]" > versions.json
fi

# Install dependencies
yarn
yarn build

# Create new version
yarn docusaurus docs:version $COMMIT_TAG

# Update versions.json
if [ -f "scripts/update_versions.sh" ]; then
    ./scripts/update_versions.sh
else
    echo "Warning: scripts/update_versions.sh not found. versions.json may need manual updating."
fi

# Create a new branch for the docs version
BRANCH_NAME="docs/version-$COMMIT_TAG"
git checkout -b $BRANCH_NAME

# Commit changes
git add .
git commit -m "chore(docs): cut new docs version for tag $COMMIT_TAG"

# Push the branch
git push origin $BRANCH_NAME

# Create PR using GitHub CLI if available
if command -v gh &> /dev/null; then
    gh pr create \
        --title "chore(docs): cut new docs version for tag $COMMIT_TAG" \
        --body "This PR cuts a new docs version for tag $COMMIT_TAG" \
        --base master
else
    echo "GitHub CLI not found. Please create PR manually at:"
    echo "https://github.com/aztecprotocol/aztec-packages/compare/master...$BRANCH_NAME"
fi

echo "Successfully cut new docs version: $COMMIT_TAG"
