#!/usr/bin/env bash
set -eu

cd "$(dirname "$0")/.."

# Ensure Cargo is in PATH
if [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
fi

# Run PipeBackend tests (default)
echo "Running PipeBackend tests..."
cargo test --release

# Run FFI tests - requires libbarretenberg from cpp build
LIB_DIR="$(dirname "$0")/../../cpp/build/lib"
if [ ! -f "$LIB_DIR/libbarretenberg.a" ] || [ ! -f "$LIB_DIR/libenv.a" ]; then
  echo "ERROR: libbarretenberg.a or libenv.a not found at $LIB_DIR"
  echo "Run barretenberg/cpp/bootstrap.sh first"
  exit 1
fi

echo "Running FfiBackend tests..."
RUSTFLAGS="-L $LIB_DIR" cargo test --release --features ffi --lib
