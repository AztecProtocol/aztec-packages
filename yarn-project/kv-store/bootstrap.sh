#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(../bootstrap.sh hash)

function test_cmds {
  # Jest node tests, run via the generic yarn-project jest runner (they are not
  # in vitest.config.ts's include globs and use the jest API).
  for test in src/database-version/*.test.ts; do
    echo "$hash yarn-project/scripts/run_test.sh kv-store/$test"
  done

  # Node tests (vitest node project): files outside the browser-test, bench and jest dirs.
  for test in src/**/!(indexeddb|sqlite-opfs|bench|database-version)/*.test.ts; do
    echo "$hash yarn-project/kv-store/scripts/run_test.sh $test"
  done

  # Browser tests (vitest + chromium). Each file runs in its own ISOLATE
  # container — running multiple files in a single vitest invocation
  # triggers a CDP teardown deadlock on the 2-CPU CI executor. See
  # scripts/run-browser-tests.sh for the root-cause analysis.
  for test in src/indexeddb/*.test.ts src/sqlite-opfs/*.test.ts; do
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
