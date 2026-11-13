#!/usr/bin/env bash
# Runs the @aztec-foundation/bb-avm-sim package tests: the spawned bb-avm-sim binary and the wasm module.
# Needs the package built (make bb-ts-packages, or ./bootstrap.sh build_packages here).
set -euo pipefail
cd "$(dirname "$0")/.."
node --test --test-reporter=spec scripts/bb_avm_sim.test.mjs
