#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")/.."

# Ensure Cargo is in PATH
if [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
fi

LIB_DIR="../cpp/build/lib"

# Run all tests including FFI (requires libbarretenberg from cpp build)
echo "Running all tests with FFI..."
RUSTFLAGS="-L $LIB_DIR" cargo test --release --features ffi
