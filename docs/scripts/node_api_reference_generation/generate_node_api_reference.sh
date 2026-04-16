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
YARN_PROJECT_DIR="$(cd "$DOCS_ROOT/../yarn-project" && pwd)"

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

# Verify yarn-project is built
if [[ ! -d "$YARN_PROJECT_DIR/stdlib/dest" ]]; then
    echo_error "yarn-project/stdlib/dest/ not found. Run 'yarn build' from yarn-project first."
    exit 1
fi

echo_info "Generating Node JSON-RPC API reference..."
echo_info "Source: $YARN_PROJECT_DIR/stdlib/src/interfaces/"
echo_info "Output: $OUTPUT_PATH"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Run the TypeScript generator from within yarn-project so node_modules resolution works
cd "$YARN_PROJECT_DIR"
npx tsx "$SCRIPT_DIR/generate_node_api_reference.ts" \
    --yarn-project "$YARN_PROJECT_DIR" \
    --output "$OUTPUT_PATH"

echo_info "Node API reference generated successfully at $OUTPUT_PATH"
