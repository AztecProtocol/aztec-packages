#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")/.."

# Ensure Cargo is in PATH
if [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
fi

# Run all Rust tests
cargo test --release
