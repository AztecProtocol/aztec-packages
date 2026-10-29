#!/usr/bin/env bash
# Generate aztec-nr API documentation using nargo doc
# This script compiles documentation from the aztec-nr workspace and copies HTML to static folder
#
# Usage:
#   ./generate_aztec_nr_docs.sh [version]
#
# Examples:
#   ./generate_aztec_nr_docs.sh           # Generates docs for "next" version
#   ./generate_aztec_nr_docs.sh v1.0.0    # Generates docs for v1.0.0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source-path=SCRIPTDIR source=../lib/aztec_node.sh
source "$SCRIPT_DIR/../lib/aztec_node.sh"
require_aztec_node
# nargo takes the topmost workspace above the current directory, which inside the checkout is
# docs/Nargo.toml, so aztec-nr (git dependencies only) is documented from a copy outside docs/.
BUILD_DIR=$(mktemp -d)
trap 'rm -rf "$BUILD_DIR"' EXIT
git -C "$AZTEC_NODE_DIR" archive --format=tar HEAD noir-projects/aztec-nr | tar -x -C "$BUILD_DIR"
AZTEC_NR_DIR="$BUILD_DIR/noir-projects/aztec-nr"

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

OUTPUT_DIR="$DOCS_ROOT/static/aztec-nr-api/$OUTPUT_FOLDER"

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

# nargo must be the version the pinned aztec-node builds with: NARGO, else the provisioned one,
# else PATH.
PROVISION_FIX="run \`node scripts/aztec_node.mts provision nargo\` in docs/, or set NARGO"
NOIR_VERSION=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).toolchain.noir)' \
    "$DOCS_ROOT/aztec-node.json")
if [[ -n "${NARGO:-}" ]]; then
    # Convert to absolute path (important since we cd to aztec-nr directory later)
    if [[ "$NARGO" != /* && "$NARGO" == */* ]]; then
        NARGO="$(cd "$DOCS_ROOT" && cd "$(dirname "$NARGO")" && pwd)/$(basename "$NARGO")"
    fi
elif [[ -x "$DOCS_ROOT/.aztec-node/bin/nargo" ]]; then
    NARGO="$DOCS_ROOT/.aztec-node/bin/nargo"
elif command -v nargo &> /dev/null; then
    NARGO="nargo"
else
    echo_error "nargo not found: $PROVISION_FIX."
    exit 1
fi
if ! "$NARGO" --version 2> /dev/null | grep -qxF "nargo version = $NOIR_VERSION"; then
    echo_error "$NARGO is not nargo $NOIR_VERSION, which the pinned aztec-node builds with: $PROVISION_FIX."
    exit 1
fi

echo_info "Using nargo: $NARGO"
echo_info "Aztec-nr directory: $AZTEC_NR_DIR"
echo_info "Version: $VERSION"
echo_info "Output folder: $OUTPUT_FOLDER"
echo_info "Output directory: $OUTPUT_DIR"

# Change to aztec-nr directory
cd "$AZTEC_NR_DIR"

# Generate documentation
echo_info "Generating aztec-nr documentation..."
$NARGO doc --workspace

# Check if docs were generated
if [[ ! -d "$AZTEC_NR_DIR/target/docs" ]]; then
    echo_error "Documentation generation failed - target/docs not found"
    exit 1
fi

# Clean output directory
echo_info "Cleaning output directory..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy generated HTML docs
echo_info "Copying generated HTML documentation to static folder..."
cp -r "$AZTEC_NR_DIR/target/docs/"* "$OUTPUT_DIR/"

# Count files
FILE_COUNT=$(find "$OUTPUT_DIR" -name "*.html" | wc -l)
echo_info "Copied $FILE_COUNT HTML files to $OUTPUT_DIR"

echo_info "Documentation generation complete!"
echo_info "Access at: /aztec-nr-api/$OUTPUT_FOLDER/index.html"
