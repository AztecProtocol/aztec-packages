#!/usr/bin/env bash
set -euo pipefail

PROJECT_PATH=${1:-}

script_path=$(realpath $(dirname "$0"))

# Check if PATH was provided
if [ -z "$PROJECT_PATH" ]; then
  echo "Error: PATH argument is required"
  echo "Usage: aztec new [OPTIONS] <PATH>"
  echo "Run 'aztec new --help' for more information"
  exit 1
fi

for arg in "$@"; do
  if [ "$arg" == "--help" ] || [ "$arg" == "-h" ]; then
    cat << 'EOF'
Aztec New - Create a new Aztec Noir project in a new directory

Usage: aztec new [OPTIONS] <PATH>

Arguments:
  <PATH>  The path to save the new project

Options:
  --name <NAME>  Name of the package [default: package directory name]
  --lib          Use a library template
  --contract     Use a contract template [default]
  -h, --help     Print help

This command creates a new Aztec Noir project using nargo and automatically
adds the Aztec.nr dependency to your Nargo.toml file.
EOF
      exit 0
  fi
  if [ "$arg" == "--lib" ]; then
    IS_CONTRACT=0
  fi
done

echo "Creating new Noir project at $PROJECT_PATH..."
nargo new "$@"

if [ "${IS_CONTRACT:-1}" -eq 1 ]; then
  cd $PROJECT_PATH
  $script_path/setup_project.sh
fi
