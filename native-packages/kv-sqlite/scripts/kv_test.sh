#!/usr/bin/env bash
# Runs the @aztec-labs/kv-sqlite package tests: the spawned kv-sqlite binary and its library (napi).
# Needs the package built (./bootstrap.sh here).
set -euo pipefail
cd "$(dirname "$0")/.."
node --test --test-reporter=spec scripts/kv.test.mjs
