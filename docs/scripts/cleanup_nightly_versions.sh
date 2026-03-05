#!/usr/bin/env bash

# Script to clean up nightly documentation versions
# This removes all versions containing "nightly" from the Build docs
# (Network docs don't have nightly versions - they use testnet/ignition)

set -e

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$DOCS_DIR")"

# Paths
AZTEC_DOCS_DIR="$DOCS_DIR"

# Function to clean up nightly versions for Build docs
cleanup_nightly_versions() {
    local docs_dir="$1"
    local docs_name="$2"

    cd "$docs_dir"

    # Find nightly versions in developer_versions.json (Developer docs only)
    NIGHTLY_VERSIONS=$(jq -r '.[] | select(test("nightly"))' developer_versions.json 2>/dev/null || echo "")

    if [ -z "$NIGHTLY_VERSIONS" ]; then
        echo -e "${GREEN}✅ No nightly versions found in $docs_name developer_versions.json${NC}"
    else
        echo -e "${BLUE}🔍 Found nightly versions in $docs_name:${NC}"
        echo "$NIGHTLY_VERSIONS" | sed 's/^/  - /'

        # Remove nightly versions from developer_versions.json
        echo -e "${YELLOW}🗑️  Removing nightly versions from developer_versions.json...${NC}"
        jq 'map(select(test("nightly") | not))' developer_versions.json > developer_versions.json.tmp
        mv developer_versions.json.tmp developer_versions.json
        echo -e "${GREEN}✅ Updated developer_versions.json${NC}"
    fi

    # Find and remove nightly version directories from Developer docs
    VERSIONED_DOCS_DIR="$docs_dir/developer_versioned_docs"
    VERSIONED_SIDEBARS_DIR="$docs_dir/developer_versioned_sidebars"

    if [ -d "$VERSIONED_DOCS_DIR" ]; then
        echo -e "${BLUE}🔍 Checking for nightly version directories in $docs_name Developer docs...${NC}"

        # Find directories containing "nightly"
        NIGHTLY_DIRS=$(find "$VERSIONED_DOCS_DIR" -maxdepth 1 -type d -name "*nightly*" 2>/dev/null || true)

        if [ -n "$NIGHTLY_DIRS" ]; then
            echo -e "${YELLOW}🗑️  Removing nightly version directories:${NC}"
            echo "$NIGHTLY_DIRS" | while read -r dir; do
                if [ -d "$dir" ]; then
                    echo "  - $(basename "$dir")"
                    rm -rf "$dir"
                fi
            done
            echo -e "${GREEN}✅ Removed nightly version directories${NC}"
        else
            echo -e "${GREEN}✅ No nightly version directories found${NC}"
        fi
    fi

    if [ -d "$VERSIONED_SIDEBARS_DIR" ]; then
        echo -e "${BLUE}🔍 Checking for nightly sidebar files in $docs_name Developer docs...${NC}"

        # Find sidebar files containing "nightly"
        NIGHTLY_SIDEBARS=$(find "$VERSIONED_SIDEBARS_DIR" -maxdepth 1 -type f -name "*nightly*" 2>/dev/null || true)

        if [ -n "$NIGHTLY_SIDEBARS" ]; then
            echo -e "${YELLOW}🗑️  Removing nightly sidebar files:${NC}"
            echo "$NIGHTLY_SIDEBARS" | while read -r file; do
                if [ -f "$file" ]; then
                    echo "  - $(basename "$file")"
                    rm -f "$file"
                fi
            done
            echo -e "${GREEN}✅ Removed nightly sidebar files${NC}"
        else
            echo -e "${GREEN}✅ No nightly sidebar files found${NC}"
        fi
    fi

    # Clean up nightly aztec-nr-api directories
    AZTEC_NR_API_DIR="$docs_dir/static/aztec-nr-api"
    if [ -d "$AZTEC_NR_API_DIR" ]; then
        echo -e "${BLUE}🔍 Checking for nightly aztec-nr-api directories in $docs_name...${NC}"

        # Find directories containing "nightly"
        NIGHTLY_API_DIRS=$(find "$AZTEC_NR_API_DIR" -maxdepth 1 -type d -name "*nightly*" 2>/dev/null || true)

        if [ -n "$NIGHTLY_API_DIRS" ]; then
            echo -e "${YELLOW}🗑️  Removing nightly aztec-nr-api directories:${NC}"
            echo "$NIGHTLY_API_DIRS" | while read -r dir; do
                if [ -d "$dir" ]; then
                    echo "  - $(basename "$dir")"
                    rm -rf "$dir"
                fi
            done
            echo -e "${GREEN}✅ Removed nightly aztec-nr-api directories${NC}"
        else
            echo -e "${GREEN}✅ No nightly aztec-nr-api directories found${NC}"
        fi
    fi

    echo -e "${GREEN}✅ $docs_name cleanup complete${NC}"
}

cleanup_nightly_versions "$AZTEC_DOCS_DIR" "Aztec"
