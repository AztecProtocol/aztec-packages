#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(../bootstrap.sh hash)

function test_cmds {
  # nullglob so a project dir with no test files contributes nothing rather than
  # emitting the literal glob pattern as a bogus test path.
  shopt -s nullglob

  # Node tests: the dirs in vitest.config.ts's "node" project. Enumerated
  # explicitly rather than via a negated glob — a negation only excludes a dir
  # when it is the immediate parent, so browser/bench tests in nested subdirs
  # (e.g. src/sqlite-opfs/internal, src/bench/sqlite-opfs-encrypted) leaked into
  # the node list and ran un-isolated, deadlocking the browser harness.
  for test in src/lmdb/**/*.test.ts src/lmdb-v2/**/*.test.ts src/stores/**/*.test.ts src/interfaces/**/*.test.ts; do
    echo "$hash yarn-project/kv-store/scripts/run_test.sh $test"
  done

  # Browser tests (vitest + chromium): everything under the indexeddb and
  # sqlite-opfs dirs, including nested subdirs. Each file runs in its own ISOLATE
  # container — running multiple files in a single vitest invocation triggers a
  # CDP teardown deadlock on the 2-CPU CI executor. See
  # scripts/run-browser-tests.sh for the root-cause analysis. The src/bench
  # suites self-skip unless VITE_BENCH=1, so they are not run in CI.
  for test in src/indexeddb/**/*.test.ts src/sqlite-opfs/**/*.test.ts; do
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
