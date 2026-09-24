#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(cache_content_hash ^ci3)

function test_cmds {
  for f in tests/*; do
    echo "$hash ./ci3/$f"
  done
  echo "$hash ./ci3/semver test"
  local backport_hash=$(hash_str $(cache_content_hash ^scripts/backport_ ^ci3/do_or_dryrun))
  echo "$backport_hash ./scripts/backport_to_staging.test.sh"
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
