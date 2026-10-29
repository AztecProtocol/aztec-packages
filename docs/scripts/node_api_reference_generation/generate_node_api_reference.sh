#!/usr/bin/env bash
# Generate Node JSON-RPC API reference documentation from TypeScript source
#
# This script generates a complete markdown reference for the Aztec Node JSON-RPC API
# by parsing interface definitions and Zod schemas from yarn-project/stdlib.
#
# Usage:
#   ./generate_node_api_reference.sh [--target-dir <dir>]
#
# Examples:
#   ./generate_node_api_reference.sh                           # Writes to docs-operate/ (source docs)
#   ./generate_node_api_reference.sh --target-dir network_versioned_docs/version-v4.1.3/operators/reference

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck source-path=SCRIPTDIR source=../lib/aztec_node.sh
source "$SCRIPT_DIR/../lib/aztec_node.sh"
require_aztec_node
YARN_PROJECT_DIR="$AZTEC_NODE_DIR/yarn-project"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
echo_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
echo_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Default output path
OUTPUT_DIR="$DOCS_ROOT/docs-operate/operators/reference"
OUTPUT_FILE="node-api-reference.md"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --target-dir)
            OUTPUT_DIR="$DOCS_ROOT/$2"
            shift 2
            ;;
        *)
            echo_error "Unknown argument: $1"
            echo "Usage: $0 [--target-dir <dir>]"
            exit 1
            ;;
    esac
done

OUTPUT_PATH="$OUTPUT_DIR/$OUTPUT_FILE"

# The generator parses .ts source with the TypeScript compiler API, so neither a build nor an install
# in the checkout is needed: Node strips the generator's types and it imports docs' own typescript.
REQUIRED_SOURCES=(
    "$YARN_PROJECT_DIR/stdlib/src/interfaces/aztec-node.ts"
    "$YARN_PROJECT_DIR/stdlib/src/interfaces/aztec-node-admin.ts"
    "$YARN_PROJECT_DIR/stdlib/src/block/l2_block_source.ts"
)
for src in "${REQUIRED_SOURCES[@]}"; do
    if [[ ! -f "$src" ]]; then
        echo_error "Required source file not found: $src"
        exit 1
    fi
done

if [[ ! -d "$DOCS_ROOT/node_modules/typescript" ]]; then
    echo_error "docs/node_modules/typescript not found. Run 'yarn install' in docs/ first."
    exit 1
fi

echo_info "Generating Node JSON-RPC API reference..."
echo_info "Source: $YARN_PROJECT_DIR/stdlib/src/interfaces/"
echo_info "Output: $OUTPUT_PATH"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

node "$SCRIPT_DIR/generate_node_api_reference.mts" \
    --yarn-project "$YARN_PROJECT_DIR" \
    --output "$OUTPUT_PATH"

echo_info "Node API reference generated successfully at $OUTPUT_PATH"
