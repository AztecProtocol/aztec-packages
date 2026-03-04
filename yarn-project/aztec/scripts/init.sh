#!/usr/bin/env bash
set -euo pipefail

script_path=$(realpath $(dirname "$0"))

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --help|-h)
      cat << 'EOF'
Aztec Init - Create a new Aztec Noir project in the current directory

Usage: aztec init

Options:
  -h, --help     Print help

This command creates a new Aztec Noir project in the current directory with
a workspace containing a contract crate and a test crate, and automatically
adds the Aztec.nr dependency to both.

If a workspace already exists in the current directory, use
'aztec new <name>' instead to add another contract.
EOF
      exit 0
      ;;
    *)
      echo "Error: unexpected argument '$1'"
      echo "Usage: aztec init"
      echo "Run 'aztec init --help' for more information"
      exit 1
      ;;
  esac
done

package_name="$(basename $(pwd))"

echo "Initializing Aztec contract project..."
$script_path/setup_workspace.sh "$package_name"
