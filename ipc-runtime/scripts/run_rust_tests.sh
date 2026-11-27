#!/usr/bin/env bash
# Run the Rust binding tests (compiles the C++ sources via build.rs).
dir="$(cd "$(dirname "$0")/.." && pwd)"
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source
cd "$dir/rust"
cargo test
# Without `sockets` the crate is pure Rust, so a wasm module can depend on it with no C++ toolchain.
cargo build --no-default-features --target wasm32-wasip1
