#!/bin/bash

# This script updates versions.json with the latest version from versioned_docs.
# It automatically detects if nightly versions exist and includes them appropriately.

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"

# Path to versions.json
VERSIONS_FILE="$DOCS_DIR/versions.json"
VERSIONED_DOCS_DIR="$DOCS_DIR/versioned_docs"

# Ensure versions.json exists
if [ ! -f "$VERSIONS_FILE" ]; then
    echo "[]" > "$VERSIONS_FILE"
fi

if [ -d "$VERSIONED_DOCS_DIR" ]; then
    # Get all versions from versioned_docs/
    ALL_VERSIONS=$(ls -1 $VERSIONED_DOCS_DIR | sed 's/version-//' | sort -V)

    if [ -n "$ALL_VERSIONS" ]; then
        # Separate nightly and non-nightly versions
        NIGHTLY_VERSIONS=$(echo "$ALL_VERSIONS" | grep "nightly" | sort -Vr)
        NON_NIGHTLY_VERSIONS=$(echo "$ALL_VERSIONS" | grep -v "nightly" | sort -Vr)

        # Build versions array with nightly versions first, then stable versions
        NEW_VERSIONS="["
        FIRST=true

        # Add nightly versions first (newest first)
        if [ -n "$NIGHTLY_VERSIONS" ]; then
            while IFS= read -r version; do
                if [ -n "$version" ]; then
                    if [ "$FIRST" = true ]; then
                        NEW_VERSIONS="$NEW_VERSIONS\"$version\""
                        FIRST=false
                    else
                        NEW_VERSIONS="$NEW_VERSIONS, \"$version\""
                    fi
                fi
            done <<< "$NIGHTLY_VERSIONS"
        fi

        # Add non-nightly versions (newest first)
        if [ -n "$NON_NIGHTLY_VERSIONS" ]; then
            while IFS= read -r version; do
                if [ -n "$version" ]; then
                    if [ "$FIRST" = true ]; then
                        NEW_VERSIONS="$NEW_VERSIONS\"$version\""
                        FIRST=false
                    else
                        NEW_VERSIONS="$NEW_VERSIONS, \"$version\""
                    fi
                fi
            done <<< "$NON_NIGHTLY_VERSIONS"
        fi

        NEW_VERSIONS="$NEW_VERSIONS]"

        # Write to versions.json
        echo "$NEW_VERSIONS" | jq '.' > "$VERSIONS_FILE"

        echo "Updated versions.json successfully"
        if [ -n "$NIGHTLY_VERSIONS" ]; then
            NIGHTLY_COUNT=$(echo "$NIGHTLY_VERSIONS" | wc -l)
            echo "Found $NIGHTLY_COUNT nightly version(s)"
        fi
        if [ -n "$NON_NIGHTLY_VERSIONS" ]; then
            STABLE_COUNT=$(echo "$NON_NIGHTLY_VERSIONS" | wc -l)
            echo "Found $STABLE_COUNT stable version(s)"
        fi
    else
        # No versions found, exit with error
        echo "Error: No versions found in versioned_docs" >&2
        exit 1
    fi
else
    echo "Error: $VERSIONED_DOCS_DIR not found" >&2
    exit 1
fi

echo "Current versions.json:"
cat $VERSIONS_FILE
