#!/usr/bin/env bash
set -euo pipefail

NARGO=${NARGO:-nargo}
script_path=$(realpath $(dirname "$0"))

for arg in "$@"; do
  if [ "$arg" == "--help" ] || [ "$arg" == "-h" ]; then
    cat << 'EOF'
Aztec Init - Create a new Aztec Noir project in the current directory

Usage: aztec init [OPTIONS]

Options:
  --name <NAME>  Name of the package [default: current directory name]
  --lib          Use a library template
  -h, --help     Print help

This command creates a new Aztec Noir project in the current directory using nargo
and automatically adds the Aztec.nr dependency to your Nargo.toml file.

EOF
    exit 0
  fi
  if [ "$arg" == "--lib" ]; then
    is_contract=0
  fi
done

echo "Initializing Noir project..."
$NARGO init "$@"

if [ "${is_contract:-1}" -eq 1 ]; then
  $script_path/setup_project.sh
fi
