#!/usr/bin/env bash
# Generate TypeScript API documentation for LLM consumption
# This script generates TypeDoc JSON and Markdown output for curated Aztec packages
#
# Usage:
#   ./generate_ts_api_docs.sh [version]
#
# Examples:
#   ./generate_ts_api_docs.sh           # Generates docs for "next" version
#   ./generate_ts_api_docs.sh v1.0.0    # Generates docs for v1.0.0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
YARN_PROJECT_DIR="$(cd "$DOCS_ROOT/../yarn-project" && pwd)"

# Version defaults to "next" if not provided
VERSION="${1:-next}"

# Determine output folder name - use stable paths for nightly/devnet/testnet/mainnet
# RELEASE_TYPE env var takes precedence for explicit mapping (e.g., when version string
# doesn't self-identify its release type, like v4.2.0-aztecnr-rc.2 for mainnet)
if [[ -n "${RELEASE_TYPE:-}" ]]; then
    OUTPUT_FOLDER="$RELEASE_TYPE"
elif [[ "$VERSION" == *"nightly"* ]]; then
    OUTPUT_FOLDER="nightly"
elif [[ "$VERSION" == *"devnet"* ]]; then
    OUTPUT_FOLDER="devnet"
elif [[ "$VERSION" == *"mainnet"* ]]; then
    OUTPUT_FOLDER="mainnet"
elif [[ "$VERSION" == *"testnet"* ]]; then
    OUTPUT_FOLDER="testnet"
elif [[ "$VERSION" == *"rc"* ]]; then
    OUTPUT_FOLDER="testnet"
else
    OUTPUT_FOLDER="$VERSION"
fi

JSON_OUTPUT_DIR="$DOCS_ROOT/static/typescript-api/$OUTPUT_FOLDER"
MARKDOWN_OUTPUT_DIR="$DOCS_ROOT/docs-developers/docs/typescript-api"
TEMP_TYPEDOC_DIR=""  # Will be set by mktemp in main()
TRANSFORMER_SCRIPT="$SCRIPT_DIR/transform_for_llm.ts"

# Safety check for rm -rf operations
safe_rm_rf() {
    local dir_path="$1"
    # Validate path is set and not dangerous
    if [[ -z "$dir_path" ]]; then
        echo_error "Cannot rm -rf: empty path"
        return 1
    fi
    if [[ "$dir_path" == "/" || "$dir_path" == "/tmp" || "$dir_path" == "$HOME" ]]; then
        echo_error "Cannot rm -rf: dangerous path '$dir_path'"
        return 1
    fi
    # Ensure path is under expected directories
    case "$dir_path" in
        "$DOCS_ROOT"/static/typescript-api/*|"$DOCS_ROOT"/static/typescript-api|/tmp/typedoc-*)
            rm -rf "$dir_path"
            ;;
        *)
            echo_error "Cannot rm -rf: unexpected path '$dir_path'"
            return 1
            ;;
    esac
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration file for package lists
CONFIG_FILE="$SCRIPT_DIR/config.json"

# Load package lists from config.json
load_packages_from_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo_error "Config file not found: $CONFIG_FILE"
        exit 1
    fi

    # Extract active packages from each category using Node.js for proper JSON parsing
    local packages_json
    packages_json=$(node -e "
        const config = require('$CONFIG_FILE');
        const pkgs = config.packages;
        const activePackages = [];

        // Collect all active packages from all categories
        for (const category of Object.values(pkgs)) {
            if (Array.isArray(category)) {
                for (const pkg of category) {
                    if (pkg.status === 'active' && pkg.path) {
                        activePackages.push(pkg.path);
                    }
                }
            }
        }
        console.log(JSON.stringify(activePackages));
    " 2>/dev/null)

    if [[ -z "$packages_json" || "$packages_json" == "[]" ]]; then
        echo_error "No active packages found in config.json"
        exit 1
    fi

    # Convert JSON array to bash array
    ALL_PACKAGES=()
    while IFS= read -r pkg; do
        ALL_PACKAGES+=("$pkg")
    done < <(node -e "JSON.parse('$packages_json').forEach(p => console.log(p))" 2>/dev/null)

    echo_info "Loaded ${#ALL_PACKAGES[@]} packages from config.json"
}

# Check if a package has typedocOptions in its package.json
has_typedoc_options() {
    local pkg_dir="$1"
    node -e "
        const pkg = require('$pkg_dir/package.json');
        process.exit(pkg.typedocOptions ? 0 : 1);
    " 2>/dev/null
}

# Check if typedoc is available
check_typedoc() {
    if command -v typedoc &> /dev/null; then
        TYPEDOC="typedoc"
    elif command -v npx &> /dev/null; then
        # Verify npx can find typedoc
        if npx typedoc --version &> /dev/null; then
            TYPEDOC="npx typedoc"
        else
            echo_error "typedoc not found via npx. Please install: npm install -g typedoc"
            exit 1
        fi
    else
        echo_error "Neither typedoc nor npx found. Please install Node.js and typedoc."
        exit 1
    fi
    echo_info "Using TypeDoc: $TYPEDOC"
}

# Generate TypeDoc JSON for a single package
generate_json_for_package() {
    local pkg_name="$1"
    local pkg_dir="$YARN_PROJECT_DIR/$pkg_name"

    if [[ ! -d "$pkg_dir" ]]; then
        echo_warn "Package directory not found: $pkg_dir"
        return 1
    fi

    # Check if package has typedocOptions using proper JSON parsing
    if ! has_typedoc_options "$pkg_dir"; then
        echo_warn "Package $pkg_name does not have typedocOptions in package.json"
        return 1
    fi

    echo_info "Generating docs for $pkg_name..."

    local raw_output_file="$TEMP_TYPEDOC_DIR/${pkg_name}.json"
    local output_file="$JSON_OUTPUT_DIR/${pkg_name}.md"

    # Extract entry points from package.json typedocOptions as JSON array
    local entry_points_json
    entry_points_json=$(node -e "
        const pkg = require('$pkg_dir/package.json');
        const opts = pkg.typedocOptions || {};
        const entries = opts.entryPoints || [];
        // Handle both array and string formats
        const entryArray = Array.isArray(entries) ? entries : [entries];
        console.log(JSON.stringify(entryArray));
    " 2>/dev/null || echo "[]")

    # Parse JSON array into bash array safely
    local entry_points_arr=()
    while IFS= read -r entry; do
        entry_points_arr+=("$entry")
    done < <(node -e "JSON.parse('$entry_points_json').forEach(e => console.log(e))" 2>/dev/null)

    if [[ ${#entry_points_arr[@]} -eq 0 ]]; then
        echo_warn "No entry points found for $pkg_name"
        return 1
    fi

    local error_log="/tmp/typedoc_${pkg_name}.log"
    local typedoc_exit_code=0
    (
        cd "$pkg_dir"
        # --excludeExternals prevents including types from node_modules (e.g., viem)
        $TYPEDOC --json "$raw_output_file" \
            --excludePrivate \
            --excludeInternal \
            --excludeExternals \
            --skipErrorChecking \
            --tsconfig ./tsconfig.json \
            "${entry_points_arr[@]}" \
            2>"$error_log"
    ) || typedoc_exit_code=$?

    # If raw output file not generated, show first few lines of error
    if [[ ! -f "$raw_output_file" ]] && [[ -f "$error_log" ]]; then
        local first_error
        first_error=$(grep -m1 "error" "$error_log" 2>/dev/null || head -1 "$error_log")
        if [[ -n "$first_error" ]]; then
            echo_warn "  Error: $first_error"
        fi
    fi

    if [[ -f "$raw_output_file" ]]; then
        # Transform to LLM-optimized markdown format
        # Write metadata to temp dir (used for summary generation, not kept in output)
        local metadata_file="$TEMP_TYPEDOC_DIR/${pkg_name}.meta.json"
        echo_info "Transforming $pkg_name to markdown..."
        if npx tsx "$TRANSFORMER_SCRIPT" "$raw_output_file" "$output_file" "$VERSION" --metadata-output "$metadata_file"; then
            echo_info "Generated: $output_file"
            return 0
        else
            echo_warn "Failed to transform $pkg_name"
            return 1
        fi
    else
        echo_warn "Failed to generate TypeDoc for $pkg_name"
        return 1
    fi
}

# Generate LLM-optimized summary file from metadata
# Note: Must be called before temp directory cleanup since metadata is in TEMP_TYPEDOC_DIR
generate_llm_summary() {
    echo_info "Generating LLM summary file..."

    npx tsx "$TRANSFORMER_SCRIPT" \
        --generate-summary \
        --metadata-dir "$TEMP_TYPEDOC_DIR" \
        --config "$CONFIG_FILE" \
        --output "$JSON_OUTPUT_DIR/llm-summary.txt" \
        --version "$VERSION"
}

# Main execution
main() {
    echo_info "TypeScript API Documentation Generator"
    echo_info "======================================"
    echo_info "Version: $VERSION"
    echo_info "Output folder: $OUTPUT_FOLDER"
    echo_info "Output: $JSON_OUTPUT_DIR"
    echo ""

    check_typedoc
    load_packages_from_config

    # Create temp directory atomically with mktemp
    TEMP_TYPEDOC_DIR=$(mktemp -d /tmp/typedoc-XXXXXX) || {
        echo_error "Failed to create temp directory"
        exit 1
    }
    echo_info "Using temp directory: $TEMP_TYPEDOC_DIR"

    # Clean and create output directories
    echo_info "Preparing output directories..."
    safe_rm_rf "$JSON_OUTPUT_DIR" || exit 1
    mkdir -p "$JSON_OUTPUT_DIR"
    mkdir -p "$MARKDOWN_OUTPUT_DIR"

    # Generate markdown for each package
    echo ""
    echo_info "Generating TypeDoc markdown for packages..."
    local success_count=0
    local fail_count=0

    for pkg in "${ALL_PACKAGES[@]}"; do
        if generate_json_for_package "$pkg"; then
            ((success_count++)) || true
        else
            ((fail_count++)) || true
        fi
    done

    echo ""
    echo_info "Package generation complete: $success_count succeeded, $fail_count failed"

    # Generate summary file
    echo ""
    generate_llm_summary

    # Clean up temp directory
    echo_info "Cleaning up temporary files..."
    if [[ -n "$TEMP_TYPEDOC_DIR" && -d "$TEMP_TYPEDOC_DIR" ]]; then
        rm -rf "$TEMP_TYPEDOC_DIR"
    fi

    # Count output files and calculate total size
    local md_count
    md_count=$(find "$JSON_OUTPUT_DIR" -name "*.md" 2>/dev/null | wc -l)
    local total_size
    total_size=$(du -sh "$JSON_OUTPUT_DIR" 2>/dev/null | cut -f1)

    echo ""
    echo_info "======================================"
    echo_info "Documentation generation complete!"
    echo_info "Generated $md_count markdown files (total: $total_size)"
    echo_info "Output: $JSON_OUTPUT_DIR"
    echo_info ""
    echo_info "Files:"
    echo_info "  - Package docs: /typescript-api/$OUTPUT_FOLDER/*.md"
    echo_info "  - LLM Summary:  /typescript-api/$OUTPUT_FOLDER/llm-summary.txt"
}

main "$@"
