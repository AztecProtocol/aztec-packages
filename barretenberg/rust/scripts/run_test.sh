#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

cd $(git rev-parse --show-toplevel)/barretenberg/rust

# Ensure Cargo is in PATH
if [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
fi

# PipeBackend tests were dropped along with `--features native` when bb-rs
# migrated to ipc-codegen + ipc-runtime; only the FFI backend remains.

# Run FFI backend tests (requires libbb-external.a from cpp build)
# BB_LIB_DIR tells build.rs to use local lib instead of downloading
# Must use absolute path since build.rs runs from a different directory
BB_LIB_DIR="$(cd ../cpp/build/lib && pwd)" RUSTFLAGS="-C link-arg=-Wl,--allow-multiple-definition" denoise "cargo test --release --features ffi"
