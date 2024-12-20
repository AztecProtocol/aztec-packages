#!/bin/bash
set -eu

# Go to noir repo root.
cd $(dirname "$0")/../noir-repo

# Set build data manually.
export SOURCE_DATE_EPOCH=$(date -d "today 00:00:00" +%s)
export GIT_DIRTY=false
export GIT_COMMIT=${COMMIT_HASH:-$(git rev-parse --verify HEAD)}

# Check formatting of noir code.
(cd ./test_programs && ./format.sh check)

# Check formatting of rust code.
cargo fmt --all --check

# Linting. If local use a separate build dir to not clobber incrementals. In CI we want to save space.
[ "${CI:-0}" -eq 0 ] && args="--target-dir target/clippy" || args=""
RUSTFLAGS=-Dwarnings cargo clippy $args --workspace --locked --release

# Install nextest.
./.github/scripts/cargo-binstall-install.sh
cargo-binstall cargo-nextest --version 0.9.67 -y --secure

# Test.
export RAYON_NUM_THREADS=1
jobs=$(($(nproc) / RAYON_NUM_THREADS))
[ "${CI:-0}" -eq 0 ] && args="--target-dir target/nextest" || args=""
cargo nextest run -j$jobs $args --workspace --locked --release -E '!test(hello_world_example) & !test(simple_verifier_codegen)'
