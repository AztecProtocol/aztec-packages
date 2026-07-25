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
AZTEC_NR_DIR="$(cd "$DOCS_ROOT/../noir-projects/aztec-nr" && pwd)"

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

# Resolve which nargo to use, in priority order:
#   1. $NARGO env var (e.g. exported by docs/bootstrap.sh)
#   2. The nargo built from the noir submodule
#   3. aztec-nargo from an aztec toolchain install (version-matched to the toolchain)
#   4. Any nargo on PATH
# Candidates are test-run rather than existence-checked because the repo-built
# binary may target another platform (e.g. a Linux build in a macOS checkout).
nargo_runs() {
    "$1" --version &> /dev/null
}

REPO_NARGO="$DOCS_ROOT/../noir/noir-repo/target/release/nargo"
if [[ -n "${NARGO:-}" ]]; then
    # Convert to absolute path (important since we cd to aztec-nr directory later)
    if [[ "$NARGO" != /* ]]; then
        NARGO="$(cd "$DOCS_ROOT" && cd "$(dirname "$NARGO")" && pwd)/$(basename "$NARGO")"
    fi
    if ! nargo_runs "$NARGO"; then
        echo_error "NARGO is set to '$NARGO' but it cannot be executed."
        exit 1
    fi
elif nargo_runs "$REPO_NARGO"; then
    NARGO="$REPO_NARGO"
elif AZTEC_NARGO="$(command -v aztec-nargo 2> /dev/null)" && nargo_runs "$AZTEC_NARGO"; then
    NARGO="$AZTEC_NARGO"
elif PATH_NARGO="$(command -v nargo 2> /dev/null)" && nargo_runs "$PATH_NARGO"; then
    NARGO="$PATH_NARGO"
else
    echo_error "No working nargo found. Install the aztec toolchain (aztec-up), build the noir submodule, or set the NARGO environment variable."
    exit 1
fi

echo_info "Using nargo: $NARGO"
echo_info "Aztec-nr directory: $AZTEC_NR_DIR"
echo_info "Version: $VERSION"
echo_info "Output folder: $OUTPUT_FOLDER"
echo_info "Output directory: $OUTPUT_DIR"

# A nargo built from a different noir commit than the submodule pins can fail
# in opaque ways (e.g. stack overflows in `nargo doc`), so warn on mismatch.
PINNED_NOIR_COMMIT="$(git -C "$DOCS_ROOT/.." ls-tree HEAD noir/noir-repo 2> /dev/null | awk '{print $3}' || true)"
NARGO_NOIR_COMMIT="$("$NARGO" --version 2> /dev/null | sed -n 's/.*git version hash: \([0-9a-f]*\).*/\1/p' || true)"
if [[ -n "$PINNED_NOIR_COMMIT" && -n "$NARGO_NOIR_COMMIT" && "$PINNED_NOIR_COMMIT" != "$NARGO_NOIR_COMMIT" ]]; then
    echo_warn "nargo was built from noir commit ${NARGO_NOIR_COMMIT:0:10} but the noir submodule pins ${PINNED_NOIR_COMMIT:0:10}. Doc generation may fail; use a matching nargo if it does."
fi

# Change to aztec-nr directory
cd "$AZTEC_NR_DIR"

# Generate documentation
echo_info "Generating aztec-nr documentation..."
"$NARGO" doc --workspace

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

# Clean up generated artifacts in aztec-nr directory
echo_info "Cleaning up build artifacts..."
rm -rf "$AZTEC_NR_DIR/target/docs"

echo_info "Documentation generation complete!"
echo_info "Access at: /aztec-nr-api/$OUTPUT_FOLDER/index.html"
