#!/bin/bash
# Unified convenience script to generate CLI documentation in one step
# Usage: ./scripts/cli_reference_generation/generate_cli_docs.sh <cli_name> [output_dir]
#
# Examples:
#   ./scripts/cli_reference_generation/generate_cli_docs.sh aztec
#   ./scripts/cli_reference_generation/generate_cli_docs.sh aztec-wallet /tmp
#
# Environment variables for performance tuning:
#   CLI_SCAN_WORKERS  - Number of parallel workers (default: 1, use 4-8 for faster scans)
#   CLI_SCAN_TIMEOUT  - Timeout per command in seconds (default: 30)
#
# Example with parallel scanning:
#   CLI_SCAN_WORKERS=4 ./scripts/cli_reference_generation/generate_cli_docs.sh aztec

set -euo pipefail

# Performance tuning via environment variables
CLI_SCAN_WORKERS="${CLI_SCAN_WORKERS:-1}"
CLI_SCAN_TIMEOUT="${CLI_SCAN_TIMEOUT:-30}"

# Validate arguments
if [[ $# -lt 1 ]]; then
  echo "Error: CLI name is required"
  echo "Usage: $0 <cli_name> [output_dir]"
  echo "  cli_name: 'aztec' or 'aztec-wallet'"
  echo "  output_dir: Output directory (default: current directory)"
  exit 1
fi

CLI_NAME="$1"
OUTPUT_DIR="${2:-.}"

# Validate CLI name
if [[ "$CLI_NAME" != "aztec" && "$CLI_NAME" != "aztec-wallet" ]]; then
  echo "Error: Invalid CLI name '$CLI_NAME'. Must be 'aztec' or 'aztec-wallet'"
  exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR OUTPUT_DIR CLI_NAME

# Configuration (compatible with bash 3.2+)
case "$CLI_NAME" in
  aztec)
    DISPLAY_NAME="Aztec CLI"
    TITLE="Aztec CLI Reference"
    COMMAND="aztec"
    JSON_FILE="$OUTPUT_DIR/aztec_cli_docs.json"
    MD_FILE="$OUTPUT_DIR/aztec_cli_reference.md"
    ;;
  aztec-wallet)
    DISPLAY_NAME="Aztec Wallet CLI"
    TITLE="Aztec Wallet CLI Reference"
    COMMAND="aztec-wallet"
    JSON_FILE="$OUTPUT_DIR/aztec_wallet_cli_docs.json"
    MD_FILE="$OUTPUT_DIR/aztec_wallet_cli_reference.md"
    ;;
esac

echo "=== ${DISPLAY_NAME} Documentation Generator ==="
echo ""

echo "Step 1: Scanning ${COMMAND} CLI commands..."
echo "  Workers: $CLI_SCAN_WORKERS, Timeout: ${CLI_SCAN_TIMEOUT}s"
python3 "$SCRIPT_DIR/scan_cli.py" --command "$COMMAND" --output "$JSON_FILE" \
  --workers "$CLI_SCAN_WORKERS" --timeout "$CLI_SCAN_TIMEOUT"

echo ""
echo "Step 2: Generating markdown documentation..."
python3 "$SCRIPT_DIR/transform_to_markdown.py" \
  --input "$JSON_FILE" \
  --output "$MD_FILE" \
  --title "$TITLE"

echo ""
echo "=== Documentation Generated ==="
echo "  JSON: $JSON_FILE"
echo "  Markdown: $MD_FILE"
echo ""
echo "To customize the output, use the scripts directly:"
echo "  python3 $SCRIPT_DIR/scan_cli.py --help"
echo "  python3 $SCRIPT_DIR/transform_to_markdown.py --help"
