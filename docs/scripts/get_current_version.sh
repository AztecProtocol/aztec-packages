#!/bin/bash

# This script fetches the current version from versioned_docs directory
# Returns the version number (e.g. "v0.85.0")

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"

# Path to versioned_docs directory
VERSIONED_DOCS_DIR="$DOCS_DIR/versioned_docs"

# Get latest version from versioned_docs/, excluding "Latest"
CURRENT_VERSION=$(ls -1 $VERSIONED_DOCS_DIR | sed 's/version-//' | sort -V | tail -n1)

# Output the version
echo "$CURRENT_VERSION"
