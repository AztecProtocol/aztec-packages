#!/bin/bash
# Script to regenerate auto-generated CLI documentation for both aztec and aztec-wallet
# Usage: ./scripts/cli_reference_generation/update_all_cli_docs.sh [target_version]
#
# Examples:
#   ./scripts/cli_reference_generation/update_all_cli_docs.sh                    # Updates all versions
#   ./scripts/cli_reference_generation/update_all_cli_docs.sh v2.0.2             # Updates only v2.0.2
#   ./scripts/cli_reference_generation/update_all_cli_docs.sh current            # Updates only main docs folder

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_VERSION="${1:-all}"
readonly SCRIPT_DIR TARGET_VERSION

# Array of CLIs to process
readonly CLIS=("aztec" "aztec-wallet")

echo "=== Update All CLI Documentation Script ==="
echo ""
echo "This script will update documentation for:"
for cli in "${CLIS[@]}"; do
  echo "  - $cli CLI"
done
echo ""

# Process each CLI using the unified script
for cli in "${CLIS[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Updating $cli CLI Documentation"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  "$SCRIPT_DIR/update_cli_docs.sh" "$cli" "$TARGET_VERSION"

  echo ""
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All CLI Documentation Updated"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Files updated:"
for cli in "${CLIS[@]}"; do
  if [[ "$cli" == "aztec" ]]; then
    echo "  - Aztec CLI reference (cli_reference_autogen.md)"
  else
    echo "  - Aztec Wallet CLI reference (cli_wallet_reference_autogen.md)"
  fi
done
echo ""
echo "You can now commit these changes to the repository."
