#!/usr/bin/env bash
# Runs the @aztec-labs/kv-sqlite package tests: the spawned kv-sqlite binary, its library (napi) and the wasm module.
# Needs the package built (./bootstrap.sh here).
set -euo pipefail
cd "$(dirname "$0")/.."
node --test --test-reporter=spec scripts/kv.test.mjs
