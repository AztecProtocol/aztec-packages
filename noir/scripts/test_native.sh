#!/bin/bash
set -eu

cd $(dirname "$0")/../noir-repo

# Set build data manually.
export SOURCE_DATE_EPOCH=$(date -d "today 00:00:00" +%s)
export GIT_DIRTY=false
export GIT_COMMIT=${COMMIT_HASH:-$(git rev-parse --verify HEAD)}

# cargo fmt --all --check
RUSTFLAGS=-Dwarnings cargo clippy --target-dir target/clippy --workspace --locked --release

./.github/scripts/cargo-binstall-install.sh
cargo-binstall cargo-nextest --version 0.9.67 -y --secure

export RAYON_NUM_THREADS=1
JOBS=$(($(nproc) / RAYON_NUM_THREADS))
cargo nextest run -j$JOBS --target-dir target/nextest --workspace --locked --release -E '!test(hello_world_example) & !test(simple_verifier_codegen)'
