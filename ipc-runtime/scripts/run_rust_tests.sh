#!/usr/bin/env bash
# Run the Rust binding tests (compiles the C++ sources via build.rs).
source $(git rev-parse --show-toplevel)/ci3/source
cd ../rust
cargo test
