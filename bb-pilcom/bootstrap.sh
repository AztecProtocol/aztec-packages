#!/usr/bin/env bash
current_dir="$(dirname "$(readlink -f "$0")")"
cargo build --manifest-path=$current_dir/Cargo.toml --release
