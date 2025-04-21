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
    echo "New docs version should be cut manually"
    exit 0
fi

# Check if GitHub CLI is available
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is required but not installed"
    echo "New docs version should be cut manually"
    exit 0
fi

# Skip if this is a nightly build
# COMMIT_TAG is set in docs/bootstrap.sh
if [[ "$COMMIT_TAG" == *"nightly"* ]]; then
    echo "Skipping docs version cut for nightly build $COMMIT_TAG"
    exit 0
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

# Create PR using GitHub CLI
gh pr create \
    --title "chore(docs): cut new docs version for tag $COMMIT_TAG" \
    --body "This PR cuts a new docs version for tag $COMMIT_TAG" \
    --base master
echo "Successfully cut new docs version: $COMMIT_TAG and opened a PR"

