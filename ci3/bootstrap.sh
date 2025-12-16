#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(cache_content_hash ^ci3)

function test_cmds {
  echo "$hash $ci3/tests/redact_test"
  echo "$hash $ci3/semver test"
}

function test {
  echo_header "ci3 tests"
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
