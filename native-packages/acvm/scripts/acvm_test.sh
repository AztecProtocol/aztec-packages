#!/usr/bin/env bash
# Runs the @aztec-labs/acvm package tests: the spawned aztec-acvm binary and the wasm module.
# Needs the package built (./bootstrap.sh here).
set -euo pipefail
cd "$(dirname "$0")/.."
node --test --test-reporter=spec scripts/acvm.test.mjs
