#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")"

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

# Clean
rm -rf broadcast cache out serve

# Install foundry if forge not found.
if ! command -v forge &> /dev/null
then
    echo "Installing foundry..."
    ./scripts/install_foundry.sh
fi

# Install
forge install --no-commit

# Ensure libraries are at the correct version
git submodule update --init --recursive ./lib

# Compile contracts
forge build
