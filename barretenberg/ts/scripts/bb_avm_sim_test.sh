#!/usr/bin/env bash
# Runs the @aztec-foundation/bb-avm-sim package tests: the spawned bb-avm-sim binary and the wasm module.
# Needs the package built (make bb-avm-sim, or ./bootstrap.sh build_bb_avm_sim here).
set -euo pipefail
cd "$(dirname "$0")/.."
node --test --test-reporter=spec scripts/bb_avm_sim.test.mjs
