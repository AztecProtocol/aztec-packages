#!/usr/bin/env bash
# Runs the @aztec-foundation/wsdb-ref package tests against one backend: napi or wasm.
# Needs the package built (make bb-wsdb-ref, or ./bootstrap.sh build_wsdb_ref here).
set -euo pipefail
backend=${1:?usage: wsdb_ref_test.sh <napi|wasm>}
cd "$(dirname "$0")/.."
WSDB_REF_TEST_BACKEND="$backend" node --test --test-reporter=spec scripts/wsdb_ref.test.mjs
