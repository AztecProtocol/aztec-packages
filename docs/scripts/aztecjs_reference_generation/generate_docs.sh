#!/bin/bash
# Convenience script to generate Aztec.js API documentation in one step
# Usage: ./scripts/aztecjs_reference_generation/generate_docs.sh [output_dir] [--validate]

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${1:-.}"
VALIDATE_FLAG=""

# Check if --validate flag is provided
for arg in "$@"; do
  if [[ "$arg" == "--validate" ]]; then
    VALIDATE_FLAG="--validate --validation-report $OUTPUT_DIR/validation_report.json"
  fi
done

readonly SCRIPT_DIR OUTPUT_DIR
readonly AZTEC_JS_SRC="$SCRIPT_DIR/../../../yarn-project/aztec.js/src"
readonly JSON_FILE="$OUTPUT_DIR/aztec_api_docs.json"
readonly MD_FILE="$OUTPUT_DIR/aztec_api_reference.md"

echo "=== Aztec.js API Documentation Generator ==="
echo ""

# Verify source directory exists
if [[ ! -d "$AZTEC_JS_SRC" ]]; then
  echo "Error: Source directory not found: $AZTEC_JS_SRC"
  exit 1
fi

echo "Step 1: Parsing TypeScript files from aztec.js..."
node "$SCRIPT_DIR/parse_typescript.js" \
  --source "$AZTEC_JS_SRC" \
  --output "$JSON_FILE" \
  --format json \
  $VALIDATE_FLAG

echo ""
echo "Step 2: Generating markdown documentation..."
python3 "$SCRIPT_DIR/transform_to_markdown.py" \
  --input "$JSON_FILE" \
  --output "$MD_FILE" \
  --title "Aztec.js API Reference"

echo ""
echo "=== Documentation Generated ==="
echo "  JSON: $JSON_FILE"
echo "  Markdown: $MD_FILE"
if [[ -n "$VALIDATE_FLAG" ]]; then
  echo "  Validation Report: $OUTPUT_DIR/validation_report.json"
fi
echo ""
echo "To customize the output, use the scripts directly:"
echo "  node $SCRIPT_DIR/parse_typescript.js --help"
echo "  python3 $SCRIPT_DIR/transform_to_markdown.py --help"
