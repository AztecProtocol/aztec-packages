#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(../bootstrap.sh hash)

function test_cmds {
  # Node tests (mocha): files outside the browser-test and bench dirs.
  # Mirrors .mocharc.json's spec.
  for test in src/**/!(indexeddb|sqlite-opfs|bench)/*.test.ts; do
    echo "$hash yarn-project/kv-store/scripts/run_test.sh $test"
  done

  # Browser tests (vitest + chromium). Each file runs in its own ISOLATE
  # container — running multiple files in a single vitest invocation
  # triggers a CDP teardown deadlock on the 2-CPU CI executor. See
  # scripts/run-browser-tests.sh for the root-cause analysis.
  for test in src/deprecated/indexeddb/*.test.ts src/sqlite-opfs/*.test.ts; do
    echo "$hash:ISOLATE=1 yarn-project/kv-store/scripts/run_test.sh $test"
  done
}

case "$cmd" in
  "")
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
