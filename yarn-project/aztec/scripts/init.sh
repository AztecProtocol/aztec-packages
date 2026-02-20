#!/usr/bin/env bash
set -euo pipefail

script_path=$(realpath $(dirname "$0"))

name_arg=""

# Check for help first
for arg in "$@"; do
  if [ "$arg" == "--help" ] || [ "$arg" == "-h" ]; then
    cat << 'EOF'
Aztec Init - Create a new Aztec Noir project in the current directory

Usage: aztec init [OPTIONS]

Options:
  --name <NAME>  Name of the package [default: current directory name]
  -h, --help     Print help

This command creates a new Aztec Noir project in the current directory with
a workspace containing a contract crate and a test crate, and automatically
adds the Aztec.nr dependency to both.
EOF
    exit 0
  fi
done

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --name)
      name_arg="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Derive package name: use --name if provided, otherwise use current directory name
package_name="${name_arg:-$(basename $(pwd))}"

echo "Initializing Aztec contract project..."
$script_path/setup_workspace.sh "$package_name"
