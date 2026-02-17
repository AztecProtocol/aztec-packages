#!/bin/bash
# Script to generate auto-generated CLI documentation for all supported CLIs
# Usage: ./scripts/cli_reference_generation/generate_all_cli_docs.sh [OPTIONS] [target_version] [output_dir]
#
# Options:
#   --force, -f              Skip version mismatch confirmation prompt
#   --workers, -w <N>        Number of parallel workers (default: 1, sequential)
#   --timeout, -t <seconds>  Timeout per command in seconds (default: 15)
#
# Environment Variables:
#   CLI_SCAN_WORKERS   Override default workers (same as --workers)
#   CLI_SCAN_TIMEOUT   Override default timeout (same as --timeout)
#
# Examples:
#   ./scripts/cli_reference_generation/generate_all_cli_docs.sh                    # Generate for all versions
#   ./scripts/cli_reference_generation/generate_all_cli_docs.sh v2.0.2             # Generate for v2.0.2 only
#   ./scripts/cli_reference_generation/generate_all_cli_docs.sh current            # Generate for current only
#   ./scripts/cli_reference_generation/generate_all_cli_docs.sh v2.0.2 /tmp/       # Output all to /tmp/
#   ./scripts/cli_reference_generation/generate_all_cli_docs.sh --workers 8        # Parallel scan with 8 workers

set -euo pipefail

# Get script directory and source shared config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/cli_config.sh"

# Parse arguments
FORCE_MODE=false
WORKERS="${CLI_SCAN_WORKERS:-1}"
TIMEOUT="${CLI_SCAN_TIMEOUT:-15}"
POSITIONAL_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force|-f)
      FORCE_MODE=true
      shift
      ;;
    --workers|-w)
      WORKERS="$2"
      shift 2
      ;;
    --timeout|-t)
      TIMEOUT="$2"
      shift 2
      ;;
    *)
      POSITIONAL_ARGS+=("$1")
      shift
      ;;
  esac
done

# Restore positional arguments
set -- "${POSITIONAL_ARGS[@]:-}"

TARGET_VERSION="${1:-all}"
OUTPUT_DIR="${2:-}"
readonly SCRIPT_DIR TARGET_VERSION OUTPUT_DIR

echo "=== Generate All CLI Documentation ==="
echo ""
echo "This script will generate documentation for:"
for cli in "${VALID_CLIS[@]}"; do
  echo "  - $cli CLI"
done
echo ""

# Build the options to pass to generate_cli_docs.sh
OPTS=()
if [[ "$FORCE_MODE" == true ]]; then
  OPTS+=("--force")
fi
OPTS+=("--workers" "$WORKERS")
OPTS+=("--timeout" "$TIMEOUT")

# Process each CLI using the unified script
for cli in "${VALID_CLIS[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Generating $cli CLI Documentation"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ -n "$OUTPUT_DIR" ]]; then
    "$SCRIPT_DIR/generate_cli_docs.sh" "${OPTS[@]}" "$cli" "$TARGET_VERSION" "$OUTPUT_DIR"
  else
    "$SCRIPT_DIR/generate_cli_docs.sh" "${OPTS[@]}" "$cli" "$TARGET_VERSION"
  fi

  echo ""
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All CLI Documentation Generated"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Files generated:"
for cli in "${VALID_CLIS[@]}"; do
  get_cli_config "$cli"
  if [[ -n "$OUTPUT_DIR" ]]; then
    echo "  - $OUTPUT_DIR/$CLI_OUTPUT_FILE"
  else
    echo "  - $CLI_OUTPUT_FILE"
  fi
done
echo ""
if [[ -z "$OUTPUT_DIR" ]]; then
  echo "You can now commit these changes to the repository."
fi
