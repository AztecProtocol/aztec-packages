#!/usr/bin/env bash
# Run the Rust binding tests (compiles the C++ sources via build.rs).
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source
cd $(dirname $0)/../rust
cargo test
