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
a workspace containing a Counter contract example with tests. The Counter
demonstrates private state, private functions, and utility reads.

Use 'aztec new <name>' to create a blank contract project, or to add another
contract to an existing workspace.
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
$script_path/setup_workspace.sh "$package_name" counter
