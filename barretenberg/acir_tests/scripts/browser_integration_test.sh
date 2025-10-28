#!/usr/bin/env bash
# Run browser integration tests for bb.js
# This validates the browser environment, WASM loading, and backend class availability

source $(git rev-parse --show-toplevel)/ci3/source

echo_header "Running browser integration tests"

# Navigate to TypeScript project
cd ../ts

# Run the browser integration test suite
dump_fail "yarn test browser.test.ts"
