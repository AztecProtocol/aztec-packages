#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
npm ci --ignore-scripts --no-audit --no-fund
npm test
node dist/main.js
git diff --exit-code -- \
  ../../src/barretenberg/flavor/generated \
  ../../src/barretenberg/honk/execution_trace/generated \
  ../../src/barretenberg/stdlib/primitives/circuit_builders/generated
test -z "$(git status --porcelain -- \
  ../../src/barretenberg/flavor/generated \
  ../../src/barretenberg/honk/execution_trace/generated \
  ../../src/barretenberg/stdlib/primitives/circuit_builders/generated)"
