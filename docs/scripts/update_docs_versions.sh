#!/usr/bin/env bash

# This script updates the version config for a docs instance.
# It scans versioned_docs directories, reconciles with the existing config file
# (preserving type→version mappings), and writes the updated config.
#
# The Docusaurus-compatible *_versions.json is auto-generated from the
# config file (for developer docs) or managed directly (for network docs).
#
# Both developer and network docs use a config file
# (developer_version_config.json / network_version_config.json).
#
# Usage: ./update_docs_versions.sh [instance] [release_type version]
#   instance:     "developer" (default) or "network"
#   release_type: optional - set this type's version in the config before reconciling
#   version:      required if release_type is specified
#
# Examples:
#   ./update_docs_versions.sh                            # Reconcile developer config
#   ./update_docs_versions.sh developer                  # Same
#   ./update_docs_versions.sh network mainnet v4.2.0     # Set mainnet=v4.2.0, then reconcile
#   ./update_docs_versions.sh developer nightly v5.0.0   # Set nightly=v5.0.0, then reconcile

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"

# Parse instance argument (default to "developer")
INSTANCE="${1:-developer}"
RELEASE_TYPE="${2:-}"
NEW_VERSION="${3:-}"

# Path to config file and versioned_docs for the specified instance
CONFIG_FILE="$DOCS_DIR/${INSTANCE}_version_config.json"
VERSIONS_FILE="$DOCS_DIR/${INSTANCE}_versions.json"
VERSIONED_DOCS_DIR="$DOCS_DIR/${INSTANCE}_versioned_docs"

echo "Updating versions for docs instance: $INSTANCE"

# If release type and version provided, update the config file first
if [ -n "$RELEASE_TYPE" ] && [ -n "$NEW_VERSION" ]; then
    if [ ! -f "$CONFIG_FILE" ]; then
        echo "{\"$RELEASE_TYPE\": \"$NEW_VERSION\"}" | jq '.' > "$CONFIG_FILE"
        echo "Created $CONFIG_FILE with $RELEASE_TYPE = $NEW_VERSION"
    else
        node -e "
            const fs = require('fs');
            const config = require('$CONFIG_FILE');
            config['$RELEASE_TYPE'] = '$NEW_VERSION';
            fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2) + '\n');
            console.log('Updated $CONFIG_FILE: $RELEASE_TYPE = $NEW_VERSION');
        "
    fi
fi

# For instances without a config file, fall back to the legacy array-based approach
# (falls back to legacy array-based approach if no config file exists)
if [ ! -f "$CONFIG_FILE" ]; then
    echo "No config file found at $CONFIG_FILE, using legacy array-based approach"
    if [ ! -f "$VERSIONS_FILE" ]; then
        echo "[]" > "$VERSIONS_FILE"
    fi

    if [ -d "$VERSIONED_DOCS_DIR" ]; then
        ALL_VERSIONS=$(ls -1 "$VERSIONED_DOCS_DIR" | sed 's/version-//' | sort -V)
        if [ -n "$ALL_VERSIONS" ]; then
            NIGHTLY_VERSIONS=$(echo "$ALL_VERSIONS" | grep "nightly" | sort -Vr)
            NON_NIGHTLY_VERSIONS=$(echo "$ALL_VERSIONS" | grep -v "nightly")
            NEW_VERSIONS="["
            FIRST=true
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
                done <<< "$(echo "$NON_NIGHTLY_VERSIONS" | sort -Vr)"
            fi
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
            NEW_VERSIONS="$NEW_VERSIONS]"
            echo "$NEW_VERSIONS" | jq '.' > "$VERSIONS_FILE"
            echo "Updated ${INSTANCE}_versions.json successfully"
        else
            echo "Error: No versions found in ${INSTANCE}_versioned_docs" >&2
            exit 1
        fi
    else
        echo "Error: $VERSIONED_DOCS_DIR not found" >&2
        exit 1
    fi
    echo "Current ${INSTANCE}_versions.json:"
    cat "$VERSIONS_FILE"
    exit 0
fi

if [ -d "$VERSIONED_DOCS_DIR" ]; then
    # Get all versions from versioned docs directory
    ALL_VERSIONS=$(ls -1 "$VERSIONED_DOCS_DIR" | sed 's/version-//' | sort -V)

    if [ -n "$ALL_VERSIONS" ]; then
        # Read existing config to preserve type mappings
        # Build a reverse map: version → type from current config
        EXISTING_CONFIG=$(cat "$CONFIG_FILE")

        # Use node to reconcile: keep existing type mappings, remove stale entries,
        # warn about unmapped versions
        node -e "
            const fs = require('fs');
            const config = $EXISTING_CONFIG;
            const allVersions = $(echo "$ALL_VERSIONS" | jq -R . | jq -s .);

            // Build reverse lookup: version → type
            const versionToType = {};
            for (const [type, version] of Object.entries(config)) {
                if (version) versionToType[version] = type;
            }

            // Build new config: keep existing type mappings for versions that still exist
            const newConfig = {};
            for (const [type, version] of Object.entries(config)) {
                if (version && allVersions.includes(version)) {
                    newConfig[type] = version;
                } else if (version) {
                    console.error('Removed stale entry: ' + type + ' = ' + version);
                }
            }

            // Warn about any versioned docs directories not in the config.
            // The config file is the source of truth for type→version mapping —
            // version strings cannot reliably self-identify their release type
            // (e.g. v4.2.0-aztecnr-rc.2 is mainnet, not testnet).
            // Unmapped versions are left out of the config; update the config
            // manually to assign them to the correct release type.
            for (const version of allVersions) {
                if (!versionToType[version]) {
                    console.error('WARNING: Version ' + version + ' has versioned docs but is not in the config file. Update ' + '$CONFIG_FILE' + ' manually to assign it a release type.');
                }
            }

            fs.writeFileSync('$CONFIG_FILE', JSON.stringify(newConfig, null, 2) + '\n');

            // Generate the Docusaurus-compatible array file:
            // config-mapped versions first, then any unmapped directories
            const configVersionSet = new Set(Object.values(newConfig).filter(Boolean));
            const unmapped = allVersions.filter(v => !configVersionSet.has(v));
            const versionsArray = [...Object.values(newConfig).filter(Boolean), ...unmapped];
            fs.writeFileSync('$VERSIONS_FILE', JSON.stringify(versionsArray, null, 2) + '\n');
        "

        echo "Updated ${INSTANCE}_version_config.json successfully"

        NIGHTLY_COUNT=$(echo "$ALL_VERSIONS" | grep "nightly" | wc -l)
        NON_NIGHTLY_COUNT=$(echo "$ALL_VERSIONS" | grep -v "nightly" | wc -l)
        if [ "$NIGHTLY_COUNT" -gt 0 ]; then
            echo "Found $NIGHTLY_COUNT nightly version(s)"
        fi
        if [ "$NON_NIGHTLY_COUNT" -gt 0 ]; then
            echo "Found $NON_NIGHTLY_COUNT stable version(s)"
        fi
    else
        # No versions found, exit with error
        echo "Error: No versions found in ${INSTANCE}_versioned_docs" >&2
        exit 1
    fi
else
    echo "Error: $VERSIONED_DOCS_DIR not found" >&2
    exit 1
fi

echo "Current ${INSTANCE}_version_config.json:"
cat "$CONFIG_FILE"
