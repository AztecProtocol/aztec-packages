#!/usr/bin/env bash
# Generate noir-protocol-circuits API documentation using nargo doc
# This script compiles documentation from the noir-protocol-circuits workspace and copies HTML to static folder
#
# Usage:
#   ./generate_protocol_circuits_docs.sh [version]
#
# Examples:
#   ./generate_protocol_circuits_docs.sh           # Generates docs for "next" version
#   ./generate_protocol_circuits_docs.sh v1.0.0    # Generates docs for v1.0.0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROTOCOL_CIRCUITS_DIR="$(cd "$DOCS_ROOT/../noir-projects/noir-protocol-circuits" && pwd)"

# Version defaults to "next" if not provided
VERSION="${1:-next}"

# Determine output folder name - use stable paths for nightly/devnet
if [[ "$VERSION" == *"nightly"* ]]; then
    OUTPUT_FOLDER="nightly"
elif [[ "$VERSION" == *"devnet"* ]]; then
    OUTPUT_FOLDER="devnet"
else
    OUTPUT_FOLDER="$VERSION"
fi

OUTPUT_DIR="$DOCS_ROOT/static/protocol-circuits-api/$OUTPUT_FOLDER"

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

# Check if nargo is available
if ! command -v nargo &> /dev/null; then
    # Try to use the nargo from the noir-repo if available
    NARGO="${NARGO:-$DOCS_ROOT/../noir/noir-repo/target/release/nargo}"
    # Convert to absolute path (important since we cd to protocol-circuits directory later)
    if [[ "$NARGO" != /* ]]; then
        NARGO="$(cd "$DOCS_ROOT" && cd "$(dirname "$NARGO")" && pwd)/$(basename "$NARGO")"
    fi
    if [[ ! -x "$NARGO" ]]; then
        echo_error "nargo not found. Please ensure nargo is installed or set NARGO environment variable."
        exit 1
    fi
else
    NARGO="nargo"
fi

echo_info "Using nargo: $NARGO"
echo_info "Protocol circuits directory: $PROTOCOL_CIRCUITS_DIR"
echo_info "Version: $VERSION"
echo_info "Output folder: $OUTPUT_FOLDER"
echo_info "Output directory: $OUTPUT_DIR"

# Change to protocol-circuits directory
cd "$PROTOCOL_CIRCUITS_DIR"

# Generate documentation
echo_info "Generating noir-protocol-circuits documentation..."
$NARGO doc --workspace

# Check if docs were generated
if [[ ! -d "$PROTOCOL_CIRCUITS_DIR/target/docs" ]]; then
    echo_error "Documentation generation failed - target/docs not found"
    exit 1
fi

# Clean output directory
echo_info "Cleaning output directory..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy generated HTML docs
echo_info "Copying generated HTML documentation to static folder..."
cp -r "$PROTOCOL_CIRCUITS_DIR/target/docs/"* "$OUTPUT_DIR/"

# Count files
FILE_COUNT=$(find "$OUTPUT_DIR" -name "*.html" | wc -l)
echo_info "Copied $FILE_COUNT HTML files to $OUTPUT_DIR"

# Clean up generated artifacts in protocol-circuits directory
echo_info "Cleaning up build artifacts..."
rm -rf "$PROTOCOL_CIRCUITS_DIR/target/docs"

echo_info "Documentation generation complete!"
echo_info "Access at: /protocol-circuits-api/$OUTPUT_FOLDER/index.html"
