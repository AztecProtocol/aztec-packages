#!/bin/bash

# Script to clean up nightly documentation versions for Barretenberg
# This removes all versions containing "nightly" from Barretenberg docs

set -e

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"

# Paths
BARRETENBERG_DOCS_DIR="$DOCS_DIR"

# Function to clean up nightly versions for Barretenberg docs
cleanup_nightly_versions() {
    local docs_dir="$1"
    local docs_name="$2"

    cd "$docs_dir"

    # Find nightly versions in versions.json
    NIGHTLY_VERSIONS=$(jq -r '.[] | select(test("nightly"))' versions.json 2>/dev/null || echo "")

    if [ -z "$NIGHTLY_VERSIONS" ]; then
        echo "✅ No nightly versions found in $docs_name versions.json"
    else
        echo "🔍 Found nightly versions in $docs_name:"
        echo "$NIGHTLY_VERSIONS" | sed 's/^/  - /'

        # Remove nightly versions from versions.json
        echo "🗑️  Removing nightly versions from versions.json..."
        jq 'map(select(test("nightly") | not))' versions.json > versions.json.tmp
        mv versions.json.tmp versions.json
        echo "✅ Updated versions.json"
    fi

    # Find and remove nightly version directories
    VERSIONED_DOCS_DIR="$docs_dir/versioned_docs"
    VERSIONED_SIDEBARS_DIR="$docs_dir/versioned_sidebars"

    if [ -d "$VERSIONED_DOCS_DIR" ]; then
        echo "🔍 Checking for nightly version directories in $docs_name..."

        # Find directories containing "nightly"
        NIGHTLY_DIRS=$(find "$VERSIONED_DOCS_DIR" -maxdepth 1 -type d -name "*nightly*" 2>/dev/null || true)

        if [ -n "$NIGHTLY_DIRS" ]; then
            echo "🗑️  Removing nightly version directories:"
            echo "$NIGHTLY_DIRS" | while read -r dir; do
                if [ -d "$dir" ]; then
                    echo "  - $(basename "$dir")"
                    rm -rf "$dir"
                fi
            done
            echo "✅ Removed nightly version directories"
        else
            echo "✅ No nightly version directories found"
        fi
    fi

    if [ -d "$VERSIONED_SIDEBARS_DIR" ]; then
        echo "🔍 Checking for nightly sidebar files in $docs_name..."

        # Find sidebar files containing "nightly"
        NIGHTLY_SIDEBARS=$(find "$VERSIONED_SIDEBARS_DIR" -maxdepth 1 -type f -name "*nightly*" 2>/dev/null || true)

        if [ -n "$NIGHTLY_SIDEBARS" ]; then
            echo "🗑️  Removing nightly sidebar files:"
            echo "$NIGHTLY_SIDEBARS" | while read -r file; do
                if [ -f "$file" ]; then
                    echo "  - $(basename "$file")"
                    rm -f "$file"
                fi
            done
            echo "✅ Removed nightly sidebar files"
        else
            echo "✅ No nightly sidebar files found"
        fi
    fi

    echo "✅ $docs_name cleanup complete"
}

cleanup_nightly_versions "$BARRETENBERG_DOCS_DIR" "Barretenberg"
