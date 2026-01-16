#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd $(git rev-parse --show-toplevel)/barretenberg/rust

# Ensure Cargo is in PATH
if [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
fi

# Run all tests (FFI is enabled by default, links to cpp/build/lib automatically)
denoise "cargo test --release"
