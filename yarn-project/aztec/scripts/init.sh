#!/usr/bin/env bash
set -euo pipefail

script_path=$(realpath $(dirname "$0"))

# Check for help first
for arg in "$@"; do
  if [ "$arg" == "--help" ] || [ "$arg" == "-h" ]; then
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
  fi
done

package_name="$(basename $(pwd))"

echo "Initializing Aztec contract project..."
$script_path/setup_workspace.sh "$package_name"
