#!/usr/bin/env bash
set -euo pipefail

for arg in "$@"; do
  if [ "$arg" == "--help" ] || [ "$arg" == "-h" ]; then
    cat << 'EOF'
Aztec Init - Create a new Aztec Noir project in the current directory

Usage: aztec init [OPTIONS]

Options:
  --name <NAME>  Name of the package [default: current directory name]
  --lib          Use a library template
  --contract     Use a contract template [default]
  -h, --help     Print help

This command creates a new Aztec Noir project in the current directory using nargo
and automatically adds the Aztec.nr dependency to your Nargo.toml file.

EOF
    exit 0
  fi
  if [ "$arg" == "--lib" ]; then
    IS_CONTRACT=0
  fi
done

echo "Initializing Noir project..."
nargo init "$@"

if [ "${IS_CONTRACT:-1}" -eq 1 ]; then
  $(dirname "$0")/setup_project.sh
fi
