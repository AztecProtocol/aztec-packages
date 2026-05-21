#!/usr/bin/env bash
# Runs a single kv-store test file via vitest. The vitest config
# (vitest.config.ts, projects array) determines whether the file runs
# in node or browser environment based on its path.
source $(git rev-parse --show-toplevel)/ci3/source

test=${1:?"Usage: $0 <test-file relative to kv-store/>"}
cd ..

NODE_NO_WARNINGS=1 exec yarn vitest run --config ./vitest.config.ts "$test"
