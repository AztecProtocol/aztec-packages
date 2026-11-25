#!/usr/bin/env bash
# Test entry for the repository-level scripts in scripts/. Mirrors .claude/bootstrap.sh: emits test
# commands via `test_cmds`, runs them via `test`.
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Keyed by the scripts-tests make step ($STEP_KEY).
function test_cmds {
  echo "${STEP_KEY:-disabled-cache} ./scripts/tests/init_test"
  # Reads every script in the repository, so a content hash narrower than the whole tree would let a
  # new script that skips the prep pass on a cached result.
  echo "disabled-cache ./scripts/tests/ci3_entrypoints_test"
}

function test {
  echo_header "scripts tests"
  test_cmds | filter_test_cmds | parallelize
}

case "$cmd" in
  "")
    test
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
