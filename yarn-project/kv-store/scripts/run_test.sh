#!/usr/bin/env bash
# Runs a single kv-store test file. Dispatches to vitest+chromium for
# browser tests (under src/indexeddb or src/sqlite-opfs) and to mocha for
# everything else. Emitted by yarn-project/kv-store/bootstrap.sh test_cmds
# for CI per-file fan-out and runnable directly for local reproduction:
#
#   yarn-project/kv-store/scripts/run_test.sh src/lmdb-v2/store.test.ts
source $(git rev-parse --show-toplevel)/ci3/source

test=${1:?"Usage: $0 <test-file relative to kv-store/>"}
cd ..

case "$test" in
  src/indexeddb/*|src/sqlite-opfs/*)
    exec yarn vitest run --config ./vitest.config.ts "$test"
    ;;
  *)
    NODE_NO_WARNINGS=1 exec yarn mocha --config ./.mocharc.json "$test"
    ;;
esac
